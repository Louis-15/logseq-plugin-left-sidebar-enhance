/**
 * 标题编号右键菜单模块
 * 
 * 将跳过、锁定、重号功能集成到 Logseq 原始块前方的小圆点右键菜单中
 * 纯按钮触发模式，不再有后台指示器轮询
 */

import { getBlockHeadingState, setBlockHeadingState, applyHeadingNumbersToPage } from './index'

/**
 * 初始化标题右键菜单功能（仅注册菜单项，无后台监控）
 */
export const initHeadingButtons = () => {
    // 隐藏残留的 block properties 显示（这个在 iframe 内生效即可）
    logseq.provideStyle(`
        .block-properties [data-ref="heading-num"],
        .block-properties .property-pair:has([data-ref="heading-num"]) {
            display: none !important;
        }
    `)

    // 注入菜单项 1：跳过/恢复自动编号
    logseq.Editor.registerBlockContextMenuItem('跳过/恢复自动编号', async (e) => {
        if (!e.uuid) return
        await handleSkip(e.uuid)
    })

    // 注入菜单项 2：锁定编号/取消锁定
    logseq.Editor.registerBlockContextMenuItem('锁定编号/取消锁定', async (e) => {
        if (!e.uuid) return
        await handleLock(e.uuid)
    })

    // 注入菜单项 3：重复编号/取消重复
    logseq.Editor.registerBlockContextMenuItem('重复编号/取消重复', async (e) => {
        if (!e.uuid) return
        await handleRepeat(e.uuid)
    })
}

// ==================== 菜单操作处理 ====================

/**
 * 处理"跳过"按钮点击
 * - 设置 skip 状态 + 移除标题中已有的编号 + 重新编号全页
 * - 再次点击取消跳过
 */
const handleSkip = async (blockUuid: string) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block || !block.content.match(/^#{1,6}\s+/)) {
        await logseq.UI.showMsg('该块不是标题，无法应用自动编号属性', 'warning', { timeout: 2000 })
        return
    }

    const current = getBlockHeadingState(blockUuid)
    if (current === 'skip') {
        // 取消跳过
        await setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消跳过', 'info', { timeout: 1500 })
    } else {
        // 【关键】先写入状态，再修改块内容，避免 onChanged 竞态
        await setBlockHeadingState(blockUuid, 'skip')
        await removeNumberFromBlock(blockUuid)
        logseq.UI.showMsg('已跳过编号', 'success', { timeout: 1500 })
    }
    await cleanupBlockProperty(blockUuid)
    await retriggerNumbering()
}

/**
 * 处理"锁定"按钮点击
 */
const handleLock = async (blockUuid: string) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block || !block.content.match(/^#{1,6}\s+/)) {
        await logseq.UI.showMsg('该块不是标题，无法应用自动编号属性', 'warning', { timeout: 2000 })
        return
    }

    const current = getBlockHeadingState(blockUuid)
    if (current === 'lock') {
        await setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消锁定', 'info', { timeout: 1500 })
    } else {
        await setBlockHeadingState(blockUuid, 'lock')
        logseq.UI.showMsg('已锁定当前编号状态', 'success', { timeout: 1500 })
    }
    await cleanupBlockProperty(blockUuid)
    await retriggerNumbering()
}

/**
 * 处理"重号"按钮点击
 * - 已标记为 repeat → 取消重复，恢复自动编号
 * - 未标记 → 设置 repeat 状态，编号算法会自动动态跟随前一个同级兄弟的编号
 */
const handleRepeat = async (blockUuid: string) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block || !block.content.match(/^#{1,6}\s+/)) {
        await logseq.UI.showMsg('该块不是标题，无法重号', 'warning', { timeout: 2000 })
        return
    }

    const current = getBlockHeadingState(blockUuid)
    if (current === 'repeat') {
        await setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消重复编号', 'info', { timeout: 1500 })
    } else {
        // 仅设置状态标记，编号算法会在 retriggerNumbering 中自动处理
        await setBlockHeadingState(blockUuid, 'repeat')
        logseq.UI.showMsg('已设为重复编号（动态跟随前一个标题）', 'success', { timeout: 2000 })
    }
    await cleanupBlockProperty(blockUuid)
    await retriggerNumbering()
}

// ==================== 工具函数 ====================

/**
 * 从标题块中移除编号数字（保留 # 号和正文）
 * 例如 "## 2.6 你干嘛" → "## 你干嘛"
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
 * 清理残留的 block property（如果之前用过 block properties 方案）
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
        // 延迟执行，确保状态已保存
        await new Promise(resolve => setTimeout(resolve, 300))
        await applyHeadingNumbersToPage(pageName)
    }
}

/**
 * 在块树中查找指定块的上一个同级兄弟的编号
 */
const findPrevSiblingNumber = (blocks: any[], targetUuid: string): string | null => {
    const search = (children: any[]): string | null => {
        for (let i = 0; i < children.length; i++) {
            if (children[i].uuid === targetUuid) {
                for (let j = i - 1; j >= 0; j--) {
                    const sibling = children[j]
                    if (getBlockHeadingState(sibling.uuid) === 'skip') continue
                    const content = sibling.content || ''
                    const firstLine = content.split(/\r?\n/)[0] || ''
                    const numMatch = firstLine.match(/^#{1,6}\s+([\d.]+)\s+/)
                    if (numMatch) return numMatch[1]
                }
                return null
            }
            if (children[i].children) {
                const result = search(children[i].children)
                if (result !== null) return result
            }
        }
        return null
    }
    return search(blocks)
}

/**
 * 清理函数（纯按钮模式下无后台资源需要清理）
 */
export const cleanupHeadingButtons = () => {
    // 无后台定时器或 DOM 需要清理
}
