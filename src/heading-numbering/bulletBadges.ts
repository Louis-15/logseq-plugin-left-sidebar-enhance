/**
 * 块圆点状态角标
 *
 * 把标题块的 numbering 状态映射到块前方的小圆点上，用 SVG 线稿图标表示：
 *   skip         → 禁止符号（圆圈 + 斜杠）
 *   skip-subtree → 禁止符号 + 同心内圈（连整棵子树一起禁用）
 *   repeat       → 复制符号（双矩形）
 *   locked       → 锁形符号
 *
 * 实现要点：
 * 1. 不给圆点换结构，只在 .bullet-container 上挂 data-lse-num 属性，视觉全部交给 CSS。
 *    这样 Logseq 的折叠、拖拽、右键菜单等原生行为完全不受影响。
 * 2. 图标用 mask-image 而不是 background-image：
 *    mask 只看图形的透明度，颜色由 background-color（currentColor）决定，
 *    因此图标能自动跟随主题文字颜色，不会像 emoji 那样自带配色。
 * 3. numbering 属性通常是隐藏的（config.edn 的 :block-hidden-properties），
 *    无法从 DOM 读出来，因此状态来自内存缓存 CACHE。
 * 4. Logseq 会因编辑而重建 .ls-block 的 DOM，所以用 MutationObserver 重新挂属性；
 *    这里只做属性写入，不重新请求数据，避免频繁 IO。
 */

import { NumberingState, parseNumberingState } from './blockStates'

/** 挂在 .bullet-container 上的状态属性名 */
const ATTR = 'data-lse-num'

/** 块 uuid → 状态 的内存缓存 */
const cache = new Map<string, NumberingState>()

let observer: MutationObserver | null = null
let applyTimer: number | null = null

/**
 * 四个状态对应的 SVG 图标
 *
 * 统一约定：
 * - 24×24 视口、fill='none'、stroke 线稿
 * - stroke 用白色而不是 currentColor：作为 mask 时白色在 alpha 和 luminance
 *   两种模式下都可见（黑色在 luminance 模式下会被当成完全透明）
 * - 数组顺序与 NumberingState 一致，便于批量生成 CSS
 */
const ICONS: Record<NumberingState, string> = {
    // 禁止：外圈 + 斜杠
    'skip': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M4.929 4.929 19.07 19.071'/></svg>`,

    // 禁止整棵子树：外圈 + 斜杠 + 同心内圈
    // 内圈半径取 4.5，保证 1em 大小下与斜杠仍能分辨
    'skip-subtree': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><circle cx='12' cy='12' r='4.5'/><path d='M4.929 4.929 19.07 19.071'/></svg>`,

    // 重复：环形箭头（lucide repeat）
    'repeat': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m17 2 4 4-4 4'/><path d='M3 11v-1a4 4 0 0 1 4-4h14'/><path d='m7 22-4-4 4-4'/><path d='M21 13v1a4 4 0 0 1-4 4H3'/></svg>`,

    // 锁：锁体 + 锁梁 + 钥匙孔
    // 钥匙孔原本是 r=1 的空心圆，1em 下几乎看不见，改为实心并略微放大
    'locked': `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='16' r='1.2' fill='white' stroke='none'/><rect x='3' y='10' width='18' height='12' rx='2'/><path d='M7 10V7a5 5 0 0 1 10 0v3'/></svg>`,
}

/**
 * 把 SVG 转成 CSS 可用的 data URI
 *
 * 只编码三个会破坏 CSS url() 的字符：< > #（# 是 URL 片段分隔符）
 * 引号统一用单引号，避免与外层 CSS 的双引号冲突。
 */
const toMaskUrl = (svg: string): string =>
    `url("data:image/svg+xml,${svg
        .replace(/#/g, '%23')
        .replace(/</g, '%3C')
        .replace(/>/g, '%3E')
        .replace(/"/g, "'")}")`

/** 单个状态的 mask 规则 */
const badgeRule = (state: NumberingState): string => {
    const url = toMaskUrl(ICONS[state])
    return `
.bullet-container[${ATTR}="${state}"] .bullet::before {
    content: "";
    display: block;
    /* 相对圆点容器（16px）的百分比，避免跟随正文字号缩放而溢出容器 */
    width: 85%;
    height: 85%;
    background-color: currentColor;
    opacity: 0.8;
    -webkit-mask-image: ${url};
    mask-image: ${url};
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
}
`
}

/** 角标样式：把灰色小圆点替换成 SVG 图标 */
const BADGE_CSS = `
.bullet-container[${ATTR}] .bullet {
    display: flex !important;
    align-items: center;
    justify-content: center;
    /* 容器是固定的 16px，所以用百分比而不是 em：
       em 会跟随正文字号放大，最终撑破容器 */
    width: 100% !important;
    height: 100% !important;
    background-color: transparent !important;
    opacity: 1 !important;
    border-radius: 9999px !important;
    font-style: normal;
    line-height: 1;
    transition: none !important;
}

/* 抑制焦点轮廓与阴影
 *
 * 右键点击块圆点会打开上下文菜单，触发元素被聚焦后浏览器可能画出默认轮廓。
 * 这里连同父级触发元素一起显式清除。
 */
.bullet-container[${ATTR}],
.bullet-container[${ATTR}]:focus,
.bullet-container[${ATTR}]:focus-visible,
.bullet-container[${ATTR}]:focus-within,
.bullet-container[${ATTR}] .bullet,
.bullet-container[${ATTR}] .bullet:focus,
.bullet-container[${ATTR}] .bullet:focus-visible,
.bullet-container[${ATTR}] .bullet::before,
.bullet-link-wrap[${ATTR}],
.bullet-link-wrap[${ATTR}]:focus,
.bullet-link-wrap[${ATTR}]:focus-visible,
.bullet-link-wrap[${ATTR}]:focus-within,
.block-control-wrap[${ATTR}],
.block-control-wrap[${ATTR}]:focus,
.block-control-wrap[${ATTR}]:focus-visible,
.block-control-wrap[${ATTR}]:focus-within {
    outline: none !important;
    outline-offset: 0 !important;
    box-shadow: none !important;
}

/* 悬停时保留容器高光，但不要把 .bullet 本身铺成实心
 *
 * Logseq 原生悬停规则：
 *   .bullet-link-wrap:hover > .bullet-container:not(.typed-list) {
 *     background-color: var(--ls-block-bullet-border-color);   ← 这层高光要保留
 *     .bullet { transform: scale(1.2); background-color: ... !important; }
 *   }
 * 原生 .bullet 是 6px 的小圆点，铺底色就是"圆点变亮"；
 * 但我们的 .bullet 已经被替换成图标画布（撑满 16px），铺底色会在图标背后
 * 垫一个亮圆盘，把线稿冲淡。因此这里只中和 .bullet 的底色与缩放，
 * 容器那层高光保持原样。
 *
 * 特异性：Logseq 那条是 (0,4,0) 且带 !important，
 * 必须用带两个属性的选择器提到 (0,6,0) 才能压住。
 */
.bullet-link-wrap[${ATTR}]:hover > .bullet-container[${ATTR}] .bullet {
    background-color: transparent !important;
    transform: none !important;
}
/* 去掉「已选中」状态的 3px 边框
 *
 * Logseq 原生的选中指示来自 block.css / style.css：
 *   .ls-block span.bullet-container:not(.as-order-list) .selected { border: 3px solid }
 * 而 renderer 里 .bullet 在选中时会带上 selected 类：
 *   [:span.bullet (when selected? {:blockid uuid :class "selected"})]
 *
 * 关键点：
 * 1. border 没写颜色 → 使用 currentColor → 深色主题下就是白色
 * 2. 原生 .bullet 只有 6px，这圈边框几乎看不出来；我们的图标撑满 1em，
 *    边框就成了包住图标的白框（改圆角前是方框、之后是圆圈）
 * 3. 这里只清边框，不动 background-color，因此悬停高光保持原样
 *
 * 特异性说明：Logseq 那条是 (0,4,1)，所以必须用带两个属性的选择器把权重提到 (0,6,0)。
 */
.bullet-link-wrap[${ATTR}] > .bullet-container[${ATTR}] .bullet.selected,
.bullet-container[${ATTR}] .bullet.selected {
    border: none !important;
}

/* 选中反馈改为「图标更实一档」，避免清掉边框后完全没有状态提示 */
.bullet-link-wrap[${ATTR}] > .bullet-container[${ATTR}] .bullet.selected::before,
.bullet-container[${ATTR}] .bullet.selected::before {
    opacity: 1;
}
${(['skip', 'skip-subtree', 'repeat', 'locked'] as NumberingState[]).map(badgeRule).join('')}`

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

        // 右键打开上下文菜单时，焦点可能落到下面任意一层，因此三层都打标记，
        // 才能用 CSS 把焦点轮廓清干净（只影响圆点区域，不波及正文编辑区）
        const targets = [
            container,
            container.closest('.bullet-link-wrap'),
            container.closest('.block-control-wrap'),
        ]

        for (const el of targets) {
            if (!el) continue
            if (state) {
                if (el.getAttribute(ATTR) !== state) el.setAttribute(ATTR, state)
            } else if (el.hasAttribute(ATTR)) {
                el.removeAttribute(ATTR)
            }
        }
    })
}

/** 防抖调度：DOM 变化可能是连续的大批量重建 */
const scheduleApply = (): void => {
    if (applyTimer !== null) return
    applyTimer = window.setTimeout(() => {
        applyTimer = null
        applyBulletBadges()
    }, 100)
}

/**
 * 右键事件改派（修复「插件菜单项时有时无」）
 *
 * Logseq 的右键分发逻辑（frontend/components/content.cljs hiccup-content）：
 *
 *   (cond
 *     page                    → 页面菜单
 *     block-ref               → 引用菜单
 *     (and (state/selection?) (not (d/has-class? target "bullet")))
 *                             → custom-context-menu-content   ;; 块选中菜单，源码中没有插件项
 *     (and block-id ...)      → block-context-menu-content    ;; 块菜单，含插件项
 *     :else                   → nil)
 *
 * 而"块菜单"那一支会顺手创建选区：
 *   (state/clear-selection!) (state/conj-selection-block! block :down)
 *
 * 于是第一次右键拿到完整菜单，同时产生了选区；此后再右键时，
 * 只要 target 不是 .bullet 元素本身（差几像素就会落到 .bullet-container
 * 或 .block-control-wrap 上），就会掉进"块选中菜单"，插件项全部消失。
 *
 * 修复方式：在捕获阶段拦截落在带状态圆点区域内的右键事件，
 * 阻止 Logseq 用错误的 target 判断，改为在 .bullet 上重新派发一次，
 * 使分支条件恒为"target 带 bullet 类"，始终走完整菜单。
 */

/** 标记事件由本模块改派，避免递归拦截 */
const RETARGET_FLAG = '__lseRetargeted'

let contextMenuHandler: ((e: MouseEvent) => void) | null = null

const onContextMenuCapture = (e: MouseEvent): void => {
    // 自己派发的事件直接放行
    if ((e as any)[RETARGET_FLAG]) return

    const target = e.target as HTMLElement | null
    if (!target || typeof target.closest !== 'function') return

    // 只处理圆点区域（bullet-container 及其外层 block-control-wrap），
    // 正文区域的右键保持 Logseq 原生行为
    const container = target.closest('.bullet-container') as HTMLElement | null
    const control = target.closest('.block-control-wrap') as HTMLElement | null
    if (!container && !control) return

    // 判定是否为本插件的标题块，必须用块 uuid + 内存缓存，
    // 不能用 data-lse-num 属性：Logseq 在创建选区后会重建块 DOM，
    // 属性在 MutationObserver 重新挂上之前有一段空窗期（曾导致偶发失效）
    const blockEl = (control || container)!.closest('.ls-block') as HTMLElement | null
    const uuid = container?.getAttribute('blockid')
        || blockEl?.getAttribute('blockid')
        || ''
    const state = uuid ? cache.get(uuid) : undefined
    if (!state) return

    // 顺手补挂属性，避免图标在重建后的空窗期里消失
    const marked = [container, target.closest('.bullet-link-wrap'), control]
    for (const el of marked) {
        if (el && el.getAttribute(ATTR) !== state) el.setAttribute(ATTR, state)
    }

    // target 已经是 .bullet 时无需改派
    if (target.classList.contains('bullet')) return

    const dot = (control || container)!.querySelector('.bullet') as HTMLElement | null
    // 圆点被隐藏（如文档模式下 hide-inner-bullet）时不改派
    if (!dot || dot.getClientRects().length === 0) return

    // 阻止 Logseq 挂在 window 冒泡阶段的处理器看到错误的 target
    e.stopPropagation()
    e.preventDefault()

    const synthetic = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: parent.window as any,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        button: 2,
        buttons: 2,
    });
    (synthetic as any)[RETARGET_FLAG] = true
    dot.dispatchEvent(synthetic)
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
 * 初始化角标：注入样式 + 监听 DOM 重建 + 右键改派
 * @param retry 剩余重试次数（主内容区可能尚未渲染完成）
 */
export const initBulletBadges = (retry: number = 20): void => {
    logseq.provideStyle(BADGE_CSS)

    // 右键改派不依赖主内容区是否就绪，单独注册一次即可
    if (!contextMenuHandler) {
        contextMenuHandler = onContextMenuCapture
        parent.document.addEventListener('contextmenu', contextMenuHandler, true)
    }

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
    if (contextMenuHandler) {
        parent.document.removeEventListener('contextmenu', contextMenuHandler, true)
        contextMenuHandler = null
    }
    if (applyTimer !== null) {
        clearTimeout(applyTimer)
        applyTimer = null
    }
    cache.clear()
    parent.document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR))
}
