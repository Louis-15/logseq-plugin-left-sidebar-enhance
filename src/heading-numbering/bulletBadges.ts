/**
 * 块圆点状态角标
 *
 * 把标题块的 numbering 状态映射到块前方的小圆点上：
 *   skip         → ▶️
 *   skip-subtree → ⏩
 *   repeat       → ♻️
 *   locked       → 🔒
 *
 * 实现要点：
 * 1. 不给圆点换结构，只在 .bullet-container 上挂 data-lse-num 属性，视觉全部交给 CSS。
 *    这样 Logseq 的折叠、拖拽、右键菜单等原生行为完全不受影响。
 * 2. numbering 属性通常是隐藏的（config.edn 的 :block-hidden-properties），
 *    无法从 DOM 读出来，因此状态来自内存缓存 CACHE。
 * 3. Logseq 会因编辑而重建 .ls-block 的 DOM，所以用 MutationObserver 重新挂属性；
 *    这里只做属性写入，不重新请求数据，避免频繁 IO。
 */

import { NumberingState, parseNumberingState } from './blockStates'

/** 挂在 .bullet-container 上的状态属性名 */
const ATTR = 'data-lse-num'

/** 块 uuid → 状态 的内存缓存 */
const cache = new Map<string, NumberingState>()

let observer: MutationObserver | null = null
let applyTimer: number | null = null

/** 角标样式：把灰色小圆点替换成 emoji 图标 */
const BADGE_CSS = `
.bullet-container[${ATTR}] .bullet {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 1em !important;
    height: 1em !important;
    background-color: transparent !important;
    border-radius: 0 !important;
    opacity: 1 !important;
    font-size: 0.8em;
    font-style: normal;
    line-height: 1;
    transition: none !important;
}
.bullet-container[${ATTR}="skip"] .bullet::before { content: "▶️"; }
.bullet-container[${ATTR}="skip-subtree"] .bullet::before { content: "⏩"; }
.bullet-container[${ATTR}="repeat"] .bullet::before { content: "♻️"; }
.bullet-container[${ATTR}="locked"] .bullet::before { content: "🔒"; }
`

/**
 * 递归遍历原始块树，收集带状态的块
 *
 * 使用原始块树而非标题树，是为了覆盖 skip-subtree 子树内部、
 * 以及数据库模式下 content 里没有 # 号但属性仍存在的情况。
 */
const collectFromBlocks = (blocks: any[] | undefined | null): void => {
    if (!blocks || blocks.length === 0) return
    for (const block of blocks) {
        if (!block) continue
        const state = parseNumberingState(
            block.properties as Record<string, unknown> | undefined,
            block.content
        )
        if (state && block.uuid) cache.set(String(block.uuid), state)
        if (block.children && block.children.length > 0) collectFromBlocks(block.children)
    }
}

/**
 * 用页面块树重建缓存（编号流程内部调用，避免重复请求）
 */
export const updateBadgeCacheFromBlocks = (blocks: any[] | undefined | null): void => {
    cache.clear()
    collectFromBlocks(blocks)
}

/**
 * 把缓存映射到当前 DOM 上的圆点
 * 只写属性，不重建节点；属性已一致时跳过，避免无谓的 DOM 写入
 */
export const applyBulletBadges = (): void => {
    const doc = parent.document
    const containers = doc.querySelectorAll<HTMLElement>('.bullet-container')

    containers.forEach((container) => {
        // blockid 可能挂在圆点容器上（新版），也可能只在 .ls-block 上
        const uuid = container.getAttribute('blockid')
            || container.closest('.ls-block')?.getAttribute('blockid')
            || ''
        const state = uuid ? cache.get(uuid) : undefined

        if (state) {
            if (container.getAttribute(ATTR) !== state) container.setAttribute(ATTR, state)
        } else if (container.hasAttribute(ATTR)) {
            container.removeAttribute(ATTR)
        }
    })
}

/** 防抖调度：DOM 变化可能是连续的大批量重建 */
const scheduleApply = (): void => {
    if (applyTimer !== null) return
    applyTimer = window.setTimeout(() => {
        applyTimer = null
        applyBulletBadges()
    }, 200)
}

/**
 * 页面切换时重新扫描并刷新角标
 * 每个页面一次 getPageBlocksTree，与 TOC 刷新同量级
 */
export const refreshPageBulletBadges = async (pageName: string): Promise<void> => {
    if (!pageName) return
    try {
        const blocks = await logseq.Editor.getPageBlocksTree(pageName)
        updateBadgeCacheFromBlocks(blocks as any)
        applyBulletBadges()
    } catch (e) {
        console.warn('[LSE] 刷新圆点角标失败:', e)
    }
}

/**
 * 初始化角标：注入样式 + 监听 DOM 重建
 * @param retry 剩余重试次数（主内容区可能尚未渲染完成）
 */
export const initBulletBadges = (retry: number = 20): void => {
    logseq.provideStyle(BADGE_CSS)

    if (observer) return

    const target = parent.document.getElementById('main-content-container')
    if (!target) {
        // 插件启动较早时主内容区还不存在，稍后重试
        if (retry > 0) setTimeout(() => initBulletBadges(retry - 1), 300)
        return
    }

    observer = new MutationObserver(() => scheduleApply())
    observer.observe(target, { childList: true, subtree: true })
}

/** 插件卸载时释放资源 */
export const cleanupBulletBadges = (): void => {
    if (observer) {
        observer.disconnect()
        observer = null
    }
    if (applyTimer !== null) {
        clearTimeout(applyTimer)
        applyTimer = null
    }
    cache.clear()
    parent.document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR))
}
