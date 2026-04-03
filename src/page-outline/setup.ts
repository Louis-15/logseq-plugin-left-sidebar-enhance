import { LSPluginBaseInfo } from "@logseq/libs/dist/LSPlugin.user"
import { t } from "logseq-l10n"
import { booleanLogseqVersionMd, getCurrentPageOriginalName } from ".."
import { headerCommand } from "../headerCommand"
import { createElementWithAttributes } from "../util/domUtils"
import { removeContainer } from "../util/lib"
import { refreshPageHeaders } from "./pageHeaders"
import { routeCheck } from "./routeCheck"
import tocCSS from "./toc.css?inline"
import { settingKeys } from '../settings/keys'
import { headerRightButtons } from "./toggleHeader"


// 插件启动后前 5 秒锁定，防止初始化期间设置变更回调被误触发
let processing = true

/**
 * TOC 模块的核心初始化函数
 * 负责：渲染容器、注册路由监听、注入样式、启动光标焦点追踪
 * @param versionMd - 是否为 Markdown 模式
 */
export const setupTOCHandlers = (versionMd: boolean) => {

    setTimeout(() => {
        // 设置变更由中央分发器统一处理，此处仅注册图谱切换监听
        logseq.App.onCurrentGraphChanged(async () => {
            routeCheck(versionMd) // 图谱切换时重新检查路由
        })
        processing = false
    }, 5000)

    // 如果大纲主开关已开启，立即渲染 TOC 容器
    if (logseq.settings?.[settingKeys.toc.master] === true)
        renderTOCContainer()

    // 注入 TOC 样式表；数据库模式下需额外修复左侧容器的布局
    logseq.provideStyle(tocCSS + (versionMd === false ? `
    #main-content-container div.ls-page-blocks { 
        overflow: visible;
    }
    #left-container {
        display: unset;
        position: static;
    }
        `: ""))

    // 插件启动后延迟执行首次路由检查（等待 DOM 就绪）
    setTimeout(() => {
        routeCheck(versionMd)
    }, 800)

    // 当 Logseq 页面路由发生变化时（用户切换页面），重新检查并刷新
    logseq.App.onRouteChanged(async () => {
        await routeCheck(versionMd)
    })

    // 注册标题插入快捷命令
    headerCommand()

    // ===================== 光标焦点追踪：高亮当前编辑块所属的大纲标题 =====================
    // 原理：监听宿主文档的 focusin 事件，当用户点击进入某个编辑 Textarea 时，
    // 沿 DOM 树向上查找最近的、在侧边栏大纲中有映射的标题块，并为其施加高亮样式。
    // 使用 _lseFocusListenerAttached 标志位确保监听器只注册一次（防止插件重载时重复注册）。
    if (!(parent.document as any)._lseFocusListenerAttached) {
        parent.document.addEventListener('focusin', (e) => {
            const target = e.target as HTMLElement;
            // 只关心 Textarea（即 Logseq 的块编辑器）
            if (target.tagName !== 'TEXTAREA') return;

            // 先清理之前残留的高亮状态
            const oldActive = parent.document.querySelectorAll('#lse-toc-content .active-heading');
            oldActive.forEach((el) => {
                el.classList.remove('active-heading');
                (el as HTMLElement).style.backgroundColor = 'unset';
                (el as HTMLElement).style.color = 'unset';
                (el as HTMLElement).style.borderRadius = 'unset';
            });

            // 从当前编辑块开始，沿 DOM 树向上逐层查找
            // 直到找到一个在侧边栏大纲中有 data-uuid 映射的标题块
            let current: HTMLElement | null = target.closest('.ls-block');
            while (current) {
                const blockid = current.getAttribute('blockid');
                if (blockid) {
                    const selector = `#lse-toc-content [data-uuid="${blockid}"]`;
                    const tocItem = parent.document.querySelector(selector) as HTMLElement | null;
                    if (tocItem) {
                        // 找到匹配的大纲项，施加高亮样式
                        tocItem.classList.add('active-heading');
                        tocItem.style.backgroundColor = 'var(--ls-block-highlight-color)';
                        tocItem.style.color = 'var(--ls-link-text-color)';
                        tocItem.style.borderRadius = '2px';
                        break;
                    }
                }
                // 继续向上查找父级 ls-block
                current = current.parentElement?.closest('.ls-block') || null;
            }
        });
        // 标记监听器已挂载，防止重复注册
        (parent.document as any)._lseFocusListenerAttached = true;
    }

}

/**
 * 设置变更时的处理函数（由中央分发器调用）
 * 当 TOC 相关设置项发生变更时，按需重新渲染或刷新
 * @returns true 表示需要重新加载设置模板
 */
export const handleTocSettingsChanged = async (newSet: LSPluginBaseInfo['settings'], oldSet: LSPluginBaseInfo['settings']): Promise<boolean> => {
    if (processing) return false
    // 大纲主开关切换时，渲染或移除整个 TOC 容器
    if (oldSet[settingKeys.toc.master] !== newSet[settingKeys.toc.master]) {
        if (newSet[settingKeys.toc.master] === true)
            renderTOCContainer() // 开启 → 渲染容器
        else
            removeContainer("lse-toc-container") // 关闭 → 移除容器
        return true
    }

    // 过滤词列表或页面缩放设置变更时，刷新大纲内容
    if ((oldSet[settingKeys.toc.tocRemoveWordList] !== newSet[settingKeys.toc.tocRemoveWordList])
        || (oldSet[settingKeys.toc.booleanAsZoomPage] !== newSet[settingKeys.toc.booleanAsZoomPage])) {
        await refreshPageHeaders(getCurrentPageOriginalName())
    }
    return false
}



/**
 * 渲染 TOC 容器到左侧边栏中
 * 创建完整的 DOM 结构：外层容器 → details/summary 折叠面板 → 内容区域
 * 包含页面标题、设置/刷新按钮等 UI 元素
 */
const renderTOCContainer = () => {
    const versionMd = booleanLogseqVersionMd()
    // 如果容器已存在则先移除，避免重复渲染
    if (parent.document.getElementById("lse-toc-container"))
        removeContainer("lse-toc-container")

    setTimeout(async () => {
        // 在左侧边栏的导航容器中追加 TOC 区域
        const navEle = parent.document.querySelector(versionMd === true ? "#left-sidebar>div.left-sidebar-inner div.nav-contents-container" : "#left-sidebar>div.left-sidebar-inner div.sidebar-contents-container") as HTMLDivElement || null
        if (navEle === null) return // 找不到导航容器则取消

        // 构建 TOC 外层容器
        const divAsItemEle = createElementWithAttributes("div", {
            class: "nav-content-item mt-3 is-expand flex-shrink-0",
            id: "lse-toc-container",
        })
        // 构建可折叠的 details 面板
        const detailsEle = createElementWithAttributes("details", {
            class: "nav-content-item-inner",
            open: "true",
        })
        // 构建面板标题栏（summary）
        const summaryEle = createElementWithAttributes("summary", {
            class: "header items-center",
            title: "Left Sidebar Enhance " + t("plugin"),
        })
        summaryEle.innerText = "页面标题列表"

        // 在标题栏右侧追加设置和刷新按钮
        const buttons = headerRightButtons()
        buttons.style.position = 'absolute'
        buttons.style.right = '10px'
        ;(summaryEle as HTMLElement).style.position = 'relative'
        ;(summaryEle as HTMLElement).style.display = 'flex'
        ;(summaryEle as HTMLElement).style.alignItems = 'center'
        summaryEle.append(buttons)

        // 构建大纲内容区域
        const containerEle = createElementWithAttributes("div", {
            class: "bd",
            id: "lse-toc-inner",
        })

        // 组装 DOM 树并挂载到导航容器
        detailsEle.appendChild(summaryEle)
        detailsEle.appendChild(containerEle)
        divAsItemEle.appendChild(detailsEle)
        navEle.appendChild(divAsItemEle)

        // 延迟初始化内容区域的子容器（确保 DOM 已渲染完毕）
        setTimeout(() => {
            const containerEle: HTMLDivElement | null = parent.document.getElementById("lse-toc-inner") as HTMLDivElement | null
            if (containerEle === null) return // 容器不存在则取消
            if (containerEle.dataset.flag !== "true") { // 避免重复创建
                const divEle = createElementWithAttributes("div", {
                    id: "lse-toc-content",
                })
                containerEle.appendChild(divEle)
            }
            containerEle.dataset.flag = "true" // 标记已初始化
        }, 1)
    }, 500)
}
