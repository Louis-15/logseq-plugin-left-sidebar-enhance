/**
 * 标题编号右键菜单模块
 *
 * 编号状态写入块属性 numbering::（skip / skip-subtree / repeat / locked），
 * 不再使用外挂 JSON 白名单。纯按钮触发模式，无后台监听。
 *
 * 菜单文案统一加「编号：」前缀，让四项在右键菜单里看起来属于同一组功能。
 * 属性被隐藏后用户看不到当前状态，因此每次操作都用 showMsg 明确播报结果。
 */

import { getBlockNumberingState, setBlockNumberingState, parseNumberingState, NumberingState } from './blockStates'
import { isHeadingContent, stripNumberFromContent } from './headingText'
import { applyHeadingNumbersToPage } from './index'

/** 菜单项统一前缀 */
const MENU_PREFIX = '编号：'

/** 状态值 → 中文说明，用于操作提示 */
const STATE_LABELS: Record<NumberingState, string> = {
    'skip': '跳过编号',
    'skip-subtree': '跳过整棵子树',
    'repeat': '重复上一个编号',
    'locked': '锁定编号',
}

/** 递归清理时使用的精简块结构（只取实际用到的字段） */
interface BlockNode {
    uuid: string
    content?: string
    properties?: Record<string, unknown>
    children?: BlockNode[]
}

/** 子树清理统计 */
interface CleanupStats {
    cleaned: number         // 实际移除编号的标题数
    protectedCount: number  // 因 locked / repeat 而保留未动的块数
    failed: number          // 写入失败数
}

/**
 * 初始化标题右键菜单功能（仅注册菜单项，无后台监控）
 */
export const initHeadingButtons = () => {
    // 隐藏块属性面板中的 numbering 属性
    // 这是 config.edn 未配置 :block-hidden-properties 时的兜底方案：
    // 阅读态看不到属性面板里的这一行，但进入块编辑时仍会看到原始文本
    // 注意：拆成两条规则，避免旧版 Electron 不支持 :has() 时整条规则被丢弃
    logseq.provideStyle(`
        .block-properties [data-ref="numbering"] {
            display: none !important;
        }
        .block-properties .property-pair:has([data-ref="numbering"]) {
            display: none !important;
        }
    `)

    // 四个状态互斥，菜单项之间允许直接覆盖切换
    logseq.Editor.registerBlockContextMenuItem(`${MENU_PREFIX}跳过`, async (e) => {
        if (!e.uuid) return
        await toggleNumberingState(e.uuid, 'skip')
    })

    logseq.Editor.registerBlockContextMenuItem(`${MENU_PREFIX}跳过整棵子树`, async (e) => {
        if (!e.uuid) return
        await toggleNumberingState(e.uuid, 'skip-subtree')
    })

    logseq.Editor.registerBlockContextMenuItem(`${MENU_PREFIX}重复上一个`, async (e) => {
        if (!e.uuid) return
        await toggleNumberingState(e.uuid, 'repeat')
    })

    logseq.Editor.registerBlockContextMenuItem(`${MENU_PREFIX}锁定`, async (e) => {
        if (!e.uuid) return
        await toggleNumberingState(e.uuid, 'locked')
    })
}

// ==================== 菜单操作处理 ====================

/**
 * 切换某个编号状态
 *
 * 规则：
 * - 当前已是目标状态 → 清除属性，恢复自动编号
 * - 当前是其他状态或没有状态 → 直接覆盖为目标状态（无需先取消）
 *
 * ⚠️ 顺序约束：必须先写属性，再重新读取块、移除标题里的旧编号。
 * 否则 updateBlock 会用不含属性行的旧 content 把刚写入的属性覆盖掉。
 */
const toggleNumberingState = async (blockUuid: string, target: NumberingState) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block || !block.content.match(/^#{1,6}\s+/)) {
        await logseq.UI.showMsg('该块不是标题，无法设置编号状态', 'warning', { timeout: 2000 })
        return
    }

    const current = await getBlockNumberingState(blockUuid)

    try {
        if (current === target) {
            await setBlockNumberingState(blockUuid, null)
            await logseq.UI.showMsg(`已取消${STATE_LABELS[target]}`, 'info', { timeout: 1500 })
        } else {
            await setBlockNumberingState(blockUuid, target)

            // 跳过类状态：移除该块标题里已经存在的编号
            if (target === 'skip' || target === 'skip-subtree') {
                await removeNumberFromBlock(blockUuid)
            }

            if (target === 'skip-subtree') {
                // 递归清理整棵子树的编号（第二步新增）
                const stats = await clearSubtreeNumbers(blockUuid)
                const details: string[] = []
                if (stats.cleaned > 0) details.push(`清理 ${stats.cleaned} 个编号`)
                if (stats.protectedCount > 0) details.push(`保留 ${stats.protectedCount} 个锁定/重复块`)
                if (stats.failed > 0) details.push(`${stats.failed} 个失败`)
                const suffix = details.length > 0 ? `（${details.join('，')}）` : ''
                await logseq.UI.showMsg(
                    `已设为${STATE_LABELS[target]}${suffix}`,
                    stats.failed > 0 ? 'warning' : 'success',
                    { timeout: 2500 }
                )
            } else {
                await logseq.UI.showMsg(`已设为${STATE_LABELS[target]}`, 'success', { timeout: 1800 })
            }
        }
    } catch (e) {
        console.error('[LSE] 设置编号状态失败:', e)
        await logseq.UI.showMsg('设置编号状态失败，请查看控制台', 'error')
        return
    }

    // 清理旧版本遗留的 heading-num 属性（如果存在）
    await cleanupBlockProperty(blockUuid)
    await retriggerNumbering()
}

// ==================== 编号文本处理 ====================

// 标题判断、年份保护、编号剥离规则统一由 headingText.ts 提供，
// 避免与编号算法（index.ts）各自实现导致规则漂移

/**
 * 移除单个块的标题编号
 *
 * 注意：内部重新 getBlock，确保拿到的是写入属性后的最新 content，
 * 否则更新时会把 numbering:: 属性行一起冲掉。
 */
const removeNumberFromBlock = async (blockUuid: string) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block) return

    const newContent = stripNumberFromContent(block.content || '')
    if (newContent === null) return

    try {
        await logseq.Editor.updateBlock(blockUuid, newContent)
    } catch (e) {
        console.error(`[LSE] 移除块 ${blockUuid} 编号失败:`, e)
        throw e
    }
}

/**
 * 递归清理子树内所有标题的编号
 *
 * 规则：
 * - locked / repeat 块保留不动：锁定是"插件永不修改"，重复编号依赖上下文
 * - 每处理 10 个块让出一次事件循环，避免大批量写入卡住 UI
 * - 单块失败不中断，最后统一报告失败数量
 */
const clearSubtreeNumbers = async (blockUuid: string): Promise<CleanupStats> => {
    const stats: CleanupStats = { cleaned: 0, protectedCount: 0, failed: 0 }

    const block = await logseq.Editor.getBlock(blockUuid, { includeChildren: true })
    const rootChildren = block?.children as unknown as BlockNode[] | undefined
    if (!rootChildren || rootChildren.length === 0) return stats

    let processed = 0

    const walk = async (nodes: BlockNode[]) => {
        for (const rawNode of nodes) {
            // 某些版本可能返回 [uuid, "uuid"] 形式的元组而不是完整块实体
            const node = await resolveBlockNode(rawNode)
            if (!node) continue

            const content = node.content || ''

            // 读取状态：锁定 / 重复的块保留原编号
            const state = parseNumberingState(node.properties, content)
            if (state === 'locked' || state === 'repeat') {
                stats.protectedCount++
            } else if (isHeadingContent(content)) {
                const newContent = stripNumberFromContent(content)
                if (newContent !== null) {
                    try {
                        await logseq.Editor.updateBlock(node.uuid, newContent)
                        stats.cleaned++
                    } catch (e) {
                        console.error(`[LSE] 清理块 ${node.uuid} 编号失败:`, e)
                        stats.failed++
                    }
                }
            }

            processed++
            // 节流：每 10 个块让出一次事件循环
            if (processed % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0))
            }

            if (node.children && node.children.length > 0) {
                await walk(node.children)
            }
        }
    }

    await walk(rootChildren)
    return stats
}

/**
 * 把子节点统一成完整块实体
 *
 * Logseq 的类型定义里 children 可能是 BlockEntity，也可能是 BlockUUIDTuple，
 * 后者只能拿到 uuid，需要再请求一次块内容。
 */
const resolveBlockNode = async (raw: unknown): Promise<BlockNode | null> => {
    if (!raw) return null

    const anyRaw = raw as any
    if (typeof anyRaw.uuid === 'string') return anyRaw as BlockNode

    if (Array.isArray(anyRaw) && typeof anyRaw[0] === 'string') {
        try {
            const fetched = await logseq.Editor.getBlock(anyRaw[0], { includeChildren: true })
            return fetched ? (fetched as unknown as BlockNode) : null
        } catch (e) {
            console.warn(`[LSE] 读取子块 ${anyRaw[0]} 失败:`, e)
            return null
        }
    }

    return null
}

// ==================== 收尾 ====================

/**
 * 清理残留的 block property（旧版本用过 heading-num 属性方案）
 */
const cleanupBlockProperty = async (blockUuid: string) => {
    try {
        await logseq.Editor.removeBlockProperty(blockUuid, 'heading-num')
    } catch (e) {
        // 属性不存在时忽略
    }
}

/**
 * 重新触发当前页面的编号计算
 */
const retriggerNumbering = async () => {
    const page = await logseq.Editor.getCurrentPage()
    if (!page) return
    const pageName = (page.originalName || page.name || '') as string
    if (pageName) {
        // 延迟执行，确保属性写入与子树清理已落盘
        await new Promise(resolve => setTimeout(resolve, 300))
        await applyHeadingNumbersToPage(pageName)
    }
}

/**
 * 清理函数（纯按钮模式下无后台资源需要清理）
 */
export const cleanupHeadingButtons = () => {
    // 无后台定时器或 DOM 需要清理
}
