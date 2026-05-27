/**
 * 工具栏按钮模块
 * 
 * 提供一个"重新编号"按钮，手动触发当前页面的标题编号
 * 纯按钮触发模式，无后台监控
 */

import { createElementWithAttributes } from '../util/domUtils'
import { applyHeadingNumbersToPage } from './index'

let currentPageName: string = ''
let currentPageUuid: string = ''
let renumberIcon: HTMLElement | null = null
let isHandlingClick = false

/**
 * 创建工具栏的"重新编号"按钮
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

    // 创建"重新编号"按钮
    renumberIcon = createElementWithAttributes('a', {
        class: 'button',
        id: 'lse-heading-numbering-renumber',
        title: '重新扫描本页标题并自动编号',
        style: `
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
        `
    })

    // 编号列表图标（保留原编号图标）
    renumberIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <text x="1" y="7" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">1</text>
            <line x1="9" y1="4" x2="21" y2="4" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <text x="1" y="15" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">2</text>
            <line x1="9" y1="12" x2="21" y2="12" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            <text x="1" y="23" font-size="7" font-weight="bold" fill="#9ca3af" font-family="Arial">3</text>
            <line x1="9" y1="20" x2="21" y2="20" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
        </svg>
    `

    // 点击事件：直接编号当前页面
    renumberIcon.addEventListener('click', async () => {
        if (isHandlingClick) return
        isHandlingClick = true
        try {
            await applyHeadingNumbersToPage(currentPageName)
            await logseq.UI.showMsg('✅ 标题编号已完成', 'success', { timeout: 2000 })
        } catch (error) {
            console.error('编号失败:', error)
            await logseq.UI.showMsg('编号失败', 'error')
        } finally {
            setTimeout(() => { isHandlingClick = false }, 300)
        }
    })

    // 插入按钮到工具栏最前面
    if (toolbar.firstChild) {
        toolbar.insertBefore(renumberIcon, toolbar.firstChild)
    } else {
        toolbar.appendChild(renumberIcon)
    }
}

/**
 * 移除工具栏按钮
 */
export const removeToolbarIcon = () => {
    if (renumberIcon && renumberIcon.parentNode) {
        renumberIcon.parentNode.removeChild(renumberIcon)
        renumberIcon = null
    }
}

/**
 * 页面切换时创建/更新工具栏按钮
 */
export const updateToolbarIcon = (pageName: string, pageUuid: string) => {
    // 纯按钮触发模式：每次页面切换时重新创建按钮
    createToolbarIcon(pageName, pageUuid)
}
