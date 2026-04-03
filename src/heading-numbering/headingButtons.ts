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
    // 隐藏残留的 block properties 显示（这个在 iframe 内生效即可）
    logseq.provideStyle(`
        .block-properties [data-ref="heading-num"],
        .block-properties .property-pair:has([data-ref="heading-num"]) {
            display: none !important;
        }
    `)

    // 指示器样式必须注入到 parent.document（主页面），因为指示器 DOM 在那里
    injectIndicatorStyles()

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

/**
 * 将指示器样式注入到 parent.document.head（主页面）
 * 因为 logseq.provideStyle 只在插件 iframe 中生效
 */
const injectIndicatorStyles = () => {
    const doc = parent.document
    if (doc.getElementById('lse-indicator-styles')) return

    const style = doc.createElement('style')
    style.id = 'lse-indicator-styles'
    style.textContent = `
        .lse-indicator-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            pointer-events: none;
            z-index: 10;
        }
        .lse-heading-indicator {
            position: absolute;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .lse-heading-indicator svg {
            width: 14px;
            height: 14px;
            color: var(--ls-icon-color, #9ca3af);
        }
    `
    doc.head.appendChild(style)
}

const ICONS = {
    skip: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-skip-forward"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>`,
    lock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    repeat: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
}

/**
 * 获取或创建指示器层容器（在 parent.document 中）
 */
const getOrCreateIndicatorLayer = (): HTMLElement | null => {
    const doc = parent.document
    const container = doc.getElementById('main-content-container')
    if (!container) return null

    // 确保 container 有 position 参考点
    const style = parent.window.getComputedStyle(container)
    if (style.position === 'static') {
        container.style.position = 'relative'
    }

    let layer = container.querySelector('.lse-indicator-layer') as HTMLElement
    if (!layer) {
        layer = doc.createElement('div')
        layer.className = 'lse-indicator-layer'
        container.appendChild(layer)
    }
    return layer
}

const scanAndInjectIndicators = () => {
    try {
        const container = parent.document.getElementById('main-content-container')
        if (!container) return

        const layer = getOrCreateIndicatorLayer()
        if (!layer) return

        const containerRect = container.getBoundingClientRect()
        const containerScrollTop = container.scrollTop

        const blocks = container.querySelectorAll('.ls-block[blockid]')

        // 收集当前需要显示的 blockUuid 集合
        const activeUuids = new Set<string>()

        // 找到第一个顶层块的 bullet 来确定固定的 x 位置
        // 所有指示器都放在这个 x 位置的左侧，形成统一的竖条
        let fixedLeftX: number | null = null
        const firstTopBlock = container.querySelector('.ls-block[blockid] .bullet-container') as HTMLElement
            || container.querySelector('.ls-block[blockid] .bullet') as HTMLElement
        if (firstTopBlock) {
            const firstBulletRect = firstTopBlock.getBoundingClientRect()
            // 固定在最顶层 bullet 中心点再往左偏移 40px（保证不挡住一级标题的折叠三角和圆点）
            fixedLeftX = firstBulletRect.left + firstBulletRect.width / 2 - containerRect.left - 40
        }
        if (fixedLeftX === null) return

        blocks.forEach(blockEl => {
            const block = blockEl as HTMLElement
            const uuid = block.getAttribute('blockid')
            if (!uuid) return

            const state = getBlockHeadingState(uuid) as 'skip' | 'lock' | 'repeat' | null
            if (!state || !['skip', 'lock', 'repeat'].includes(state)) return

            activeUuids.add(uuid)

            // 找到 bullet 小圆点用于垂直对齐
            const bullet = block.querySelector('.bullet-container') as HTMLElement
                || block.querySelector('.bullet') as HTMLElement
            if (!bullet) return

            const bulletRect = bullet.getBoundingClientRect()
            const bulletCenterY = bulletRect.top + bulletRect.height / 2

            const indicatorSize = 14
            // 水平：所有层级统一使用固定 x 坐标（不再跟随各自 bullet 的缩进）
            const indicatorLeft = fixedLeftX - indicatorSize / 2
            // 垂直：与当前块的 bullet 中心对齐
            const indicatorTop = bulletCenterY - containerRect.top + containerScrollTop - indicatorSize / 2

            const indicatorId = `lse-ind-${uuid}`
            let indicator = parent.document.getElementById(indicatorId) as HTMLElement | null

            const iconSvg = ICONS[state]

            if (!indicator) {
                indicator = parent.document.createElement('div')
                indicator.id = indicatorId
                indicator.className = INDICATOR_CLASS
                indicator.innerHTML = iconSvg
                layer.appendChild(indicator)
            } else {
                if (indicator.innerHTML !== iconSvg) {
                    indicator.innerHTML = iconSvg
                }
            }

            // 设置精确位置
            indicator.style.left = `${indicatorLeft}px`
            indicator.style.top = `${indicatorTop}px`
            indicator.style.width = `${indicatorSize}px`
            indicator.style.height = `${indicatorSize}px`

            // 常驻显示，不再需要悬停触发
            indicator.style.opacity = '0.7'
        })

        // 清理已不存在的指示器
        const allIndicators = layer.querySelectorAll(`.${INDICATOR_CLASS}`)
        allIndicators.forEach(ind => {
            const id = ind.id
            if (!id.startsWith('lse-ind-')) return
            const uuid = id.replace('lse-ind-', '')
            if (!activeUuids.has(uuid)) {
                ind.remove()
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
        setBlockHeadingState(blockUuid, null)
        logseq.UI.showMsg('已取消重复编号', 'info', { timeout: 1500 })
    } else {
        // 仅设置状态标记，编号算法会在 retriggerNumbering 中自动处理
        setBlockHeadingState(blockUuid, 'repeat')
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
