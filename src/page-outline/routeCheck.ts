import { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin"
import { onPageChangedCallback, updateCurrentPage } from ".."
import { CurrentCheckPageOrZoom, getCurrentPageForMd, getCurrentZoomForMd, zoomBlockWhenDb } from "../util/query/advancedQuery"
import { clearTOC } from "./DOM"
import { whenOpenJournals } from "./journalsList"

// 调试模式开关
const debugMode = false

// 路由检查防抖锁
let processingRoot = false
/**
 * 路由检查主函数
 * 根据 Logseq 版本模式（Markdown / 数据库）分别处理页面、日志、缩放三种场景
 */
export const routeCheck = async (versionMd: boolean) => {
    if (processingRoot) return
    processingRoot = true
    setTimeout(() => (processingRoot = false), 100)

    if (debugMode) console.log("routeCheck started", { versionMd })

    if (versionMd) {
        // Markdown 版本处理流程
        if (logseq.settings!.enableJournalsList as boolean === true
            && handleMdVersionJournals(versionMd)) {
            if (debugMode) console.log("Handled MD version journals")
            return
        }
        if (await handleMdVersionPage()) {
            if (debugMode) console.log("Handled MD version page")
            return
        }
        if (await handleMdVersionZoom()) {
            if (debugMode) console.log("Handled MD version zoom")
            return
        }
    } else {
        // 数据库版本处理流程
        const pageOrZoom = await CurrentCheckPageOrZoom() as { check: "page" | "zoom"; page?: { title: string; uuid: PageEntity["uuid"] } }
        if (debugMode) console.log("CurrentCheckPageOrZoom result", pageOrZoom)

        if (pageOrZoom.check === "page" && await handleDbVersionPage(pageOrZoom, versionMd)) {
            if (debugMode) console.log("Handled DB version page")
            return
        }
        if (pageOrZoom.check === "zoom" && await handleDbVersionZoom()) {
            if (debugMode) console.log("Handled DB version zoom")
            return
        }
    }

    // 既不是页面也不是缩放模式，清空 TOC
    clearTOC()
    if (debugMode) console.log("No page or zoom found, TOC cleared")
}

// ==================== Markdown 版本处理函数 ====================

/** Markdown 模式：处理普通页面 */
const handleMdVersionPage = async () => {
    if (debugMode) console.log("handleMdVersionPage called")

    const currentPage = await getCurrentPageForMd() as { originalName: PageEntity["originalName"]; uuid: PageEntity["uuid"] } | null
    if (currentPage) {
        updateCurrentPage(currentPage.originalName, currentPage.uuid) // 更新当前页面状态
        onPageChangedCallback(currentPage.originalName) // 触发页面变更回调
        return true
    }
    return false
}

/** Markdown 模式：处理日志页面 */
const handleMdVersionJournals = (versionMd: boolean) => {
    if (debugMode) console.log("handleMdVersionJournals called")
    return validateJournalsElement(versionMd)
}

/** Markdown 模式：处理缩放模式 */
const handleMdVersionZoom = async () => {
    if (debugMode) console.log("handleMdVersionZoom called")

    const currentZoom = await getCurrentZoomForMd() as { uuid: BlockEntity["uuid"]; page: { originalName: PageEntity["originalName"]; uuid: PageEntity["uuid"] } } | null
    if (currentZoom) {
        updateCurrentPage(currentZoom.page.originalName, currentZoom.page.uuid) // 更新当前页面状态
        onPageChangedCallback(currentZoom.page.originalName, { zoomIn: true, zoomInUuid: currentZoom.uuid }) // 触发缩放模式回调
        return true
    }
    return false
}

// ==================== 数据库版本处理函数 ====================

/** 数据库模式：处理普通页面 */
const handleDbVersionPage = async (pageOrZoom: { check: "page" | "zoom"; page?: { title: string; uuid: PageEntity["uuid"] } }, versionMd: boolean) => {
    if (debugMode) console.log("handleDbVersionPage called", pageOrZoom)

    if (logseq.settings!.enableJournalsList as boolean === true
        && pageOrZoom.page?.uuid.startsWith("00000001-")) {
        // 日志页面的情况
        setTimeout(() => validateJournalsElement(versionMd), 150)
        return true
    } else if (pageOrZoom.page) {
        // 普通页面的情况
        updateCurrentPage(pageOrZoom.page.title, pageOrZoom.page.uuid) // 更新当前页面状态
        onPageChangedCallback(pageOrZoom.page.title) // 触发页面变更回调
        return true
    }
    return false
}

/** 数据库模式：处理缩放模式 */
const handleDbVersionZoom = async () => {
    if (debugMode) console.log("handleDbVersionZoom called")

    const zoomBlockElement = parent.document.querySelector("#main-content-container div.page>div>div.mb-4+div.ls-page-blocks>div>div.page-blocks-inner>div>div[id]") as HTMLDivElement | null
    if (zoomBlockElement) {
        const uuid = zoomBlockElement.id
        const blockParentPage = await zoomBlockWhenDb(uuid) as { uuid: PageEntity["uuid"]; title: string } | null
        if (blockParentPage) {
            updateCurrentPage(blockParentPage.title, blockParentPage.uuid) // 更新当前页面状态
            onPageChangedCallback(blockParentPage.title, { zoomIn: true, zoomInUuid: uuid }) // 触发缩放模式回调
            return true
        }
    } else {
        if (debugMode) console.log("handleDbVersionZoom: Not zoom")

        // Markdown 图谱的回退处理：通过页面标题 DOM 元素获取页面信息
        const pageTitleElement = parent.document.querySelector("#main-content-container div.page h1.page-title>span") as HTMLSpanElement | null
        if (pageTitleElement) {
            const pageTitle = pageTitleElement.dataset.ref || pageTitleElement.innerText
            if (pageTitle) {
                const pageUuid = await logseq.Editor.getPage(pageTitle) as PageEntity["uuid"] | null
                if (pageUuid) {
                    updateCurrentPage(pageTitle, pageUuid) // 更新当前页面状态
                    onPageChangedCallback(pageTitle) // 触发页面变更回调
                    return true
                }
            }
        }
    }
    return false
}




/** 检测当前是否为日志页面，如果是则触发日志列表显示 */
const validateJournalsElement = (versionMd: boolean): boolean => {
    if (debugMode) console.log("validateJournalsElement")
    const journalsEle = parent.document.getElementById("journals") as HTMLDivElement | null
    if (journalsEle) {
        if (debugMode) console.log("call: Journals list")
        whenOpenJournals(journalsEle, versionMd) // 获取并显示日志标题列表
        return true
    } else
        return false
}