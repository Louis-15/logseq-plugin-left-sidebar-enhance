/**
 * 工具栏按钮模块
 * 
 * 提供两个独立的工具栏按钮：
 * - 开启/恢复编号 ✅：授权当前页面自动编号，或在暂停后恢复
 * - 暂停监控 ⏸️：暂停后台监控和自动编号（保留已有编号不删除）
 */

import { createElementWithAttributes } from '../util/domUtils'
import {
    isPageActive, isPagePaused,
    applyHeadingNumbersToPage, togglePageState,
    pausePageNumbering, resumePageNumbering
} from './index'
import { pauseIndicatorScan, resumeIndicatorScan } from './headingButtons'

let currentPageName: string = ''
let currentPageUuid: string = ''
let enableIcon: HTMLElement | null = null
let pauseIcon: HTMLElement | null = null
let isHandlingClick = false

/**
 * 工具栏按钮的三种状态
 */
type ToolbarState = 'disabled' | 'active' | 'paused'

/**
 * 根据当前页面状态计算工具栏状态
 */
const getToolbarState = (): ToolbarState => {
    if (!isPageActive(currentPageUuid)) return 'disabled'
    if (isPagePaused(currentPageUuid)) return 'paused'
    return 'active'
}

/**
 * 创建工具栏按钮
 */
export const createToolbarIcon = (pageName: string, pageUuid: string) => {
    // 移除已有按钮
    removeToolbarIcon()
    currentPageName = pageName
    currentPageUuid = pageUuid

    // 查找工具栏区域
    let toolbar = parent.document.querySelector('#head>.r') as HTMLElement
    if (!toolbar) {
        toolbar = parent.document.querySelector('.cp__header-right-menu') as HTMLElement
    }
    if (!toolbar) {
        console.warn('未找到工具栏区域，无法添加编号按钮')
        return
    }

    const state = getToolbarState()

    // === 按钮1：开启/恢复自动编号 ===
    const isBtn1Active = state === 'disabled' || state === 'paused'
    enableIcon = createElementWithAttributes('a', {
        class: 'button',
        id: 'lse-heading-numbering-enable',
        title: state === 'paused'
            ? '恢复自动编号和后台监控'
            : state === 'active'
                ? '当前页面已授权自动编号'
                : '开启当前页面的自动编号',
        style: `
            cursor: ${isBtn1Active ? 'pointer' : 'not-allowed'};
            opacity: ${isBtn1Active ? '1' : '0.3'};
            pointer-events: ${isBtn1Active ? 'auto' : 'none'};
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
        `
    })

    // 编号列表图标
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

    // 按钮1 点击事件
    enableIcon.addEventListener('click', async () => {
        if (isHandlingClick) return
        isHandlingClick = true
        try {
            const s = getToolbarState()
            if (s === 'disabled') {
                // 首次开启：添加到白名单 + 编号 + 启动监控
                await togglePageState(currentPageName, currentPageUuid)
                await applyHeadingNumbersToPage(currentPageName)
                resumeIndicatorScan()
                updateButtonStates()
                await logseq.UI.showMsg('✅ 已开启当前页面的自动编号', 'success', { timeout: 2000 })
            } else if (s === 'paused') {
                // 从暂停恢复：重新编号 + 启动监控
                resumePageNumbering(currentPageUuid)
                resumeIndicatorScan()
                await applyHeadingNumbersToPage(currentPageName)
                updateButtonStates()
                await logseq.UI.showMsg('✅ 已恢复自动编号和后台监控', 'success', { timeout: 2000 })
            }
            // state === 'active' 时按钮不可点击（pointer-events: none）
        } catch (error) {
            console.error('开关编号失败:', error)
            await logseq.UI.showMsg('操作失败', 'error')
        } finally {
            setTimeout(() => { isHandlingClick = false }, 300)
        }
    })

    // === 按钮2：暂停自动编号和监控 ===
    const isBtn2Disabled = state !== 'active'
    pauseIcon = createElementWithAttributes('a', {
        class: 'button',
        id: 'lse-heading-numbering-pause',
        title: state === 'active'
            ? '暂停自动编号和后台监控（保留已有编号）'
            : state === 'paused'
                ? '已暂停自动编号和监控'
                : '请先开启自动编号',
        style: `
            cursor: ${isBtn2Disabled ? 'not-allowed' : 'pointer'};
            opacity: ${isBtn2Disabled ? '0.3' : '0.8'};
            pointer-events: ${isBtn2Disabled ? 'none' : 'auto'};
            display: ${state === 'disabled' ? 'none' : 'inline-flex'};
            align-items: center;
            justify-content: center;
            padding: 0 6px;
        `
    })

    // 暂停图标：双竖线
    pauseIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <rect x="5" y="3" width="4" height="18" rx="1" fill="#9ca3af" stroke="none"/>
            <rect x="15" y="3" width="4" height="18" rx="1" fill="#9ca3af" stroke="none"/>
        </svg>
    `

    // 按钮2 点击事件
    pauseIcon.addEventListener('click', async () => {
        if (isHandlingClick) return
        isHandlingClick = true
        try {
            const s = getToolbarState()
            if (s === 'active') {
                // 暂停：停止监控，保留编号，保留白名单
                pausePageNumbering(currentPageUuid)
                pauseIndicatorScan()
                updateButtonStates()
                await logseq.UI.showMsg('⏸️ 已暂停自动编号和后台监控（编号已保留）', 'warning', { timeout: 2500 })
            }
            // state === 'paused' 或 'disabled' 时按钮不可点击
        } catch (error) {
            console.error('暂停编号失败:', error)
            await logseq.UI.showMsg('操作失败', 'error')
        } finally {
            setTimeout(() => { isHandlingClick = false }, 300)
        }
    })

    // 插入按钮到工具栏
    if (toolbar.firstChild) {
        toolbar.insertBefore(pauseIcon, toolbar.firstChild)
        toolbar.insertBefore(enableIcon, toolbar.firstChild)
    } else {
        toolbar.appendChild(enableIcon)
        toolbar.appendChild(pauseIcon)
    }
}

/**
 * 更新两个按钮的视觉状态（根据当前三态）
 */
const updateButtonStates = () => {
    const state = getToolbarState()

    // 按钮1：开启/恢复
    if (enableIcon) {
        const isBtn1Active = state === 'disabled' || state === 'paused'
        enableIcon.style.opacity = isBtn1Active ? '1' : '0.3'
        enableIcon.style.pointerEvents = isBtn1Active ? 'auto' : 'none'
        enableIcon.style.cursor = isBtn1Active ? 'pointer' : 'not-allowed'
        enableIcon.title = state === 'paused'
            ? '恢复自动编号和后台监控'
            : state === 'active'
                ? '当前页面已授权自动编号'
                : '开启当前页面的自动编号'
    }

    // 按钮2：暂停
    if (pauseIcon) {
        const isBtn2Disabled = state !== 'active'
        pauseIcon.style.opacity = isBtn2Disabled ? '0.3' : '0.8'
        pauseIcon.style.pointerEvents = isBtn2Disabled ? 'none' : 'auto'
        pauseIcon.style.cursor = isBtn2Disabled ? 'not-allowed' : 'pointer'
        pauseIcon.style.display = state === 'disabled' ? 'none' : 'inline-flex'
        pauseIcon.title = state === 'active'
            ? '暂停自动编号和后台监控（保留已有编号）'
            : state === 'paused'
                ? '已暂停自动编号和监控'
                : '请先开启自动编号'
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
    if (pauseIcon && pauseIcon.parentNode) {
        pauseIcon.parentNode.removeChild(pauseIcon)
        pauseIcon = null
    }
}

/**
 * 页面切换时更新工具栏按钮
 */
export const updateToolbarIcon = (pageName: string, pageUuid: string) => {
    currentPageName = pageName
    currentPageUuid = pageUuid

    if (!enableIcon) {
        createToolbarIcon(pageName, pageUuid)
        return
    }

    updateButtonStates()
}
