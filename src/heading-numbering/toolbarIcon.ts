/**
 * 工具栏按钮模块
 * 
 * 提供两个独立的工具栏按钮（防止误触）：
 * - 开启编号 ✅：授权当前页面开启自动编号
 * - 清除编号 🗑️：删除当前页面所有编号 + 取消授权
 */

import { createElementWithAttributes } from '../util/domUtils'
import { isPageActive, applyHeadingNumbersToPage, togglePageState } from './index'

let currentPageName: string = ''
let enableIcon: HTMLElement | null = null
let cleanupIcon: HTMLElement | null = null
let isHandlingClick = false

/**
 * 创建工具栏按钮
 */
export const createToolbarIcon = (pageName: string) => {
    // 移除已有按钮
    removeToolbarIcon()
    currentPageName = pageName

    // 查找工具栏区域
    let toolbar = parent.document.querySelector('#head>.r') as HTMLElement
    if (!toolbar) {
        toolbar = parent.document.querySelector('.cp__header-right-menu') as HTMLElement
    }
    if (!toolbar) {
        console.warn('未找到工具栏区域，无法添加编号按钮')
        return
    }

    const isActive = isPageActive(pageName)

    // === 按钮1：开启编号 ===
    enableIcon = createElementWithAttributes('a', {
        class: 'button',
        id: 'lse-heading-numbering-enable',
        title: isActive ? '当前页面已授权自动编号' : '编号未开启（点击开启）',
        style: `
            cursor: ${isActive ? 'not-allowed' : 'pointer'};
            opacity: ${isActive ? '0.3' : '1'};
            pointer-events: ${isActive ? 'none' : 'auto'};
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
        `
    })

    // 开启编号图标：灰白线条风格的编号列表
    enableIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <text x="1" y="7" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">1</text>
            <line x1="9" y1="4" x2="21" y2="4" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <text x="1" y="15" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">2</text>
            <line x1="9" y1="12" x2="21" y2="12" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <text x="1" y="23" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">3</text>
            <line x1="9" y1="20" x2="21" y2="20" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
        </svg>
    `

    // 开启编号点击事件
    enableIcon.addEventListener('click', async () => {
        if (isHandlingClick) return
        isHandlingClick = true
        try {
            const currentActive = isPageActive(currentPageName)
            if (!currentActive) {
                // 开启编号
                await togglePageState(currentPageName)
                await applyHeadingNumbersToPage(currentPageName)
                updateToolbarIconStates(true)
                await logseq.UI.showMsg('✅ 已开启当前页面的自动编号', 'success', { timeout: 2000 })
            }
        } catch (error) {
            console.error('开关编号失败:', error)
            await logseq.UI.showMsg('操作失败', 'error')
        } finally {
            setTimeout(() => { isHandlingClick = false }, 300)
        }
    })

    // === 按钮2：清除编号 ===
    cleanupIcon = createElementWithAttributes('a', {
        class: 'button',
        id: 'lse-heading-numbering-cleanup',
        title: '清除当前页面所有编号并取消授权',
        style: `
            cursor: pointer;
            opacity: 0.6;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
        `
    })

    // 清除编号图标：编号列表 + 红色×叠在上方偏右
    cleanupIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <text x="1" y="7" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">1</text>
            <line x1="9" y1="4" x2="21" y2="4" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <text x="1" y="15" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">2</text>
            <line x1="9" y1="12" x2="21" y2="12" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <text x="1" y="23" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">3</text>
            <line x1="9" y1="20" x2="21" y2="20" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <line x1="13" y1="6" x2="21" y2="18" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="21" y1="6" x2="13" y2="18" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
    `

    // 清除编号点击事件
    cleanupIcon.addEventListener('click', async () => {
        if (isHandlingClick) return
        isHandlingClick = true
        try {
            const currentActive = isPageActive(currentPageName)
            if (currentActive) {
                // 先取消授权
                await togglePageState(currentPageName)
            }
            // togglePageState 在取消授权时会自动执行 cleanup
            updateToolbarIconStates(false)
            await logseq.UI.showMsg('🗑️ 已清除编号并取消授权', 'warning', { timeout: 2000 })
        } catch (error) {
            console.error('清除编号失败:', error)
            await logseq.UI.showMsg('操作失败', 'error')
        } finally {
            setTimeout(() => { isHandlingClick = false }, 300)
        }
    })

    // 插入按钮到工具栏
    if (toolbar.firstChild) {
        toolbar.insertBefore(cleanupIcon, toolbar.firstChild)
        toolbar.insertBefore(enableIcon, toolbar.firstChild)
    } else {
        toolbar.appendChild(enableIcon)
        toolbar.appendChild(cleanupIcon)
    }
}

/**
 * 更新两个按钮的视觉状态
 */
const updateToolbarIconStates = (isActive: boolean) => {
    if (enableIcon) {
        if (isActive) {
            enableIcon.style.opacity = '0.3'
            enableIcon.style.pointerEvents = 'none'
            enableIcon.style.cursor = 'not-allowed'
            enableIcon.title = '当前页面已授权自动编号'
        } else {
            enableIcon.style.opacity = '1'
            enableIcon.style.pointerEvents = 'auto'
            enableIcon.style.cursor = 'pointer'
            enableIcon.title = '编号未开启（点击开启）'
        }
    }
}

/**
 * 移除工具栏按钮
 */
export const removeToolbarIcon = () => {
    if (enableIcon && enableIcon.parentNode) {
        enableIcon.parentNode.removeChild(enableIcon)
        enableIcon = null
    }
    if (cleanupIcon && cleanupIcon.parentNode) {
        cleanupIcon.parentNode.removeChild(cleanupIcon)
        cleanupIcon = null
    }
}

/**
 * 页面切换时更新工具栏按钮
 */
export const updateToolbarIcon = (pageName: string) => {
    currentPageName = pageName

    if (!enableIcon) {
        createToolbarIcon(pageName)
        return
    }

    const isActive = isPageActive(pageName)
    updateToolbarIconStates(isActive)
}

