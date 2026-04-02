/**
 * 标题编号右键菜单模块
 * 
 * 将跳过、锁定、重号功能集成到 Logseq 原始块前方的小圆点右键菜单中
 * 避免了使用复杂的 DOM 注入和 CSS 解决因重绘带来的隐藏问题
 */

import { getBlockHeadingState, setBlockHeadingState, applyHeadingNumbersToPage } from './index'

let scanTimer: any = null
const INDICATOR_CLASS = 'lse-heading-indicator'

/**
 * 初始化标题右键菜单功能与指示器
 */
export const initHeadingButtons = () => {
    // 隐藏残留的 block properties 显示
    logseq.provideStyle(`
        .block-properties [data-ref="heading-num"],
        .block-properties .property-pair:has([data-ref="heading-num"]) {
            display: none !important;
        }

        /* 状态指示器样式 */
        .lse-heading-indicator {
            position: absolute;
            left: -48px; /* 位置往左一点，防止盖住折叠小三角和小圆点 */
            top: 5px;
            opacity: 0;
            transition: opacity 0.15s ease;
            pointer-events: none; /* 纯展示，不阻挡点击 */
            z-index: 10;
        }
        .block-content-wrapper:hover > .lse-heading-indicator {
            opacity: 1;
        }
        .lse-heading-indicator svg {
            width: 14px;
            height: 14px;
            color: var(--ls-icon-color, #9ca3af);
        }
    `)

    // 注入菜单项 1
    logseq.Editor.registerBlockContextMenuItem('跳过/恢复自动编号', async (e) => {
        if (!e.uuid) return
        await handleSkip(e.uuid)
    })

    // 注入菜单项 2
    logseq.Editor.registerBlockContextMenuItem('锁定编号/取消锁定', async (e) => {
        if (!e.uuid) return
        await handleLock(e.uuid)
    })

    // 注入菜单项 3
    logseq.Editor.registerBlockContextMenuItem('重复编号/取消重复', async (e) => {
        if (!e.uuid) return
        await handleRepeat(e.uuid)
    })

    // 启动状态指示器扫描
    setTimeout(() => scanAndInjectIndicators(), 1000)
    scanTimer = setInterval(() => scanAndInjectIndicators(), 500)
}

// ==================== 状态指示器逻辑 ====================

const ICONS = {
    skip: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-skip-forward"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>`,
    lock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    repeat: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
}

const scanAndInjectIndicators = () => {
    try {
        const container = parent.document.getElementById('main-content-container')
        if (!container) return

        const blocks = container.querySelectorAll('.ls-block[blockid]')

        blocks.forEach(blockEl => {
            const block = blockEl as HTMLElement
            const uuid = block.getAttribute('blockid')
            if (!uuid) return

            const wrapper = block.querySelector(':scope > div > .block-content-wrapper') as HTMLElement
                || block.querySelector(':scope > .block-content-wrapper') as HTMLElement
            if (!wrapper) return

            const blockContent = wrapper.querySelector('.block-content') as HTMLElement
            if (!blockContent) return

            // 无论是编辑态还是渲染态，我们只需要根据 uuid 读取插件配置状态
            const state = getBlockHeadingState(uuid) as 'skip' | 'lock' | 'repeat' | null

            let indicatorContainer = wrapper.querySelector(`.${INDICATOR_CLASS}`)

            if (state && ['skip', 'lock', 'repeat'].includes(state)) {
                // 如果当前处于这三种状态之一，则需要显示对应的指示器
                const iconSvg = ICONS[state]
                if (!indicatorContainer) {
                    indicatorContainer = document.createElement('div')
                    indicatorContainer.className = INDICATOR_CLASS
                    wrapper.appendChild(indicatorContainer)
                }
                // 仅当图标变化时才更新 innerHTML 防止重复渲染引发闪烁
                if (indicatorContainer.innerHTML !== iconSvg) {
                    indicatorContainer.innerHTML = iconSvg
                }
            } else {
                // 如果状态被取消，则移除指示器
                if (indicatorContainer) {
                    indicatorContainer.remove()
                }
            }
        })
    } catch (e) {
        // ignore
    }
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
        setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消跳过', 'info', { timeout: 1500 })
    } else {
        // 【关键】先写入状态，再修改块内容，避免 onChanged 竞态
        setBlockHeadingState(blockUuid, 'skip')
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
        setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消锁定', 'info', { timeout: 1500 })
    } else {
        setBlockHeadingState(blockUuid, 'lock')
        logseq.UI.showMsg('已锁定当前编号状态', 'success', { timeout: 1500 })
    }
    await cleanupBlockProperty(blockUuid)
    await retriggerNumbering()
}

/**
 * 处理"重号"按钮点击
 * - 如果此时已经是 lock，则视为取消重复（解除锁定），重新自动编号
 * - 如果不是，复制上一个同级标题的编号 → 写入当前标题 → 自动锁定
 */
const handleRepeat = async (blockUuid: string) => {
    const block = await logseq.Editor.getBlock(blockUuid)
    if (!block || !block.content.match(/^#{1,6}\s+/)) {
        await logseq.UI.showMsg('该块不是标题，无法重号', 'warning', { timeout: 2000 })
        return
    }

    const current = getBlockHeadingState(blockUuid)
    if (current === 'repeat' || current === 'lock') {
        setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消重复编号并解锁', 'info', { timeout: 1500 })
        await cleanupBlockProperty(blockUuid)
        await retriggerNumbering()
        return
    }

    const page = await logseq.Editor.getCurrentPage()
    if (!page) return
    const pageName = (page.originalName || page.name || '') as string
    if (!pageName) return

    const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName)
    if (!pageBlocks) return

    const prevNumber = findPrevSiblingNumber(pageBlocks, blockUuid)
    if (!prevNumber) {
        logseq.UI.showMsg('未找到上一个同级标题的编号，无法重号', 'warning', { timeout: 3000 })
        return
    }

    // 读取当前块内容，替换编号
    const content = block.content || ''
    const lines = content.split(/\r?\n/)
    const firstLine = lines[0] || ''
    const hashMatch = firstLine.match(/^(#{1,6})\s+/)
    if (!hashMatch) return

    const hashTags = hashMatch[1]
    let textOnly = firstLine.replace(/^#{1,6}\s+/, '').replace(/^[\d.]+\s+/, '')

    const newFirstLine = `${hashTags} ${prevNumber} ${textOnly}`
    const newContent = [newFirstLine, ...lines.slice(1)].join('\n')

    // 【关键】先写入状态，再修改块内容
    // 因为 updateBlock 会触发 Logseq 的 onChanged 回调，
    // 回调中会自动重新计算编号。如果状态还没写入，
    // 编号算法就不知道这个块是 'repeat'，会用顺延的数字覆盖掉。
    setBlockHeadingState(blockUuid, 'repeat')

    await logseq.Editor.updateBlock(blockUuid, newContent)
    await cleanupBlockProperty(blockUuid)

    logseq.UI.showMsg(`已重复编号 ${prevNumber} 并锁定`, 'success', { timeout: 2000 })
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
    let textOnly = firstLine.replace(/^#{1,6}\s+/, '').replace(/^[\d.]+\s+/, '')

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
 * 清理函数
 */
export const cleanupHeadingButtons = () => {
    if (scanTimer) clearInterval(scanTimer)
}
