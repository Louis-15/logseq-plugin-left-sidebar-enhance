/**
 * 标题编号右键菜单模块
 *
 * 编号状态写入块属性 numbering::（skip / skip-subtree / repeat / locked），
 * 不再使用外挂 JSON 白名单。纯按钮触发模式，无后台监听。
 *
 * 菜单文案统一加「编号：」前缀，让四项在右键菜单里看起来属于同一组功能。
 * 属性被隐藏后用户看不到当前状态，因此每次操作都用 showMsg 明确播报结果。
 */

import { getBlockNumberingState, setBlockNumberingState, NumberingState } from './blockStates'
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
            // （skip-subtree 的子块清理在第二步实现）
            if (target === 'skip' || target === 'skip-subtree') {
                await removeNumberFromBlock(blockUuid)
            }
            await logseq.UI.showMsg(`已设为${STATE_LABELS[target]}`, 'success', { timeout: 1800 })
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

// ==================== 工具函数 ====================

/**
 * 从标题块中移除编号数字（保留 # 号和正文）
 * 例如 "## 2.6 你干嘛" → "## 你干嘛"
 *
 * 注意：调用前必须重新 getBlock，确保拿到的是写入属性后的最新 content，
 * 否则会丢掉 numbering:: 属性行。
 */
const removeNumberFromBlock = async (blockUuid: string) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block) return

    const content = block.content || ''
    const lines = content.split(/\r?\n/)
    const firstLine = lines[0] || ''

    const hashMatch = firstLine.match(/^(#{1,6})\s+/)
    if (!hashMatch) return

    const hashTags = hashMatch[1]
    let textOnly = firstLine.replace(/^#{1,6}\s+/, '')
    // 移除编号：支持多种格式
    //   "1.2.3 标题"    → 层级编号（1-3级）
    //   "1、标题"        → 四级编号（数字+顿号，无空格）
    //   "1、 标题"       → 四级编号（数字+顿号，有空格）
    textOnly = textOnly
        .replace(/^[\d.]+\s+/, '')      // 匹配 "1.2.3 " 格式
        .replace(/^\d+、\s*/, '')        // 匹配 "1、" 或 "1、 " 格式

    if (textOnly.trim()) {
        const newFirstLine = `${hashTags} ${textOnly}`
        const newContent = [newFirstLine, ...lines.slice(1)].join('\n')
        if (newContent !== content) {
            await logseq.Editor.updateBlock(blockUuid, newContent)
        }
    }
}

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
        // 延迟执行，确保属性写入已落盘
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
