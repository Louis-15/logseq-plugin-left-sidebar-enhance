import { pageOpen } from "../util/lib"
import { clearTOC } from "./DOM"
import { scrollToWithOffset } from "../util/domUtils"
import { clearCachedHeaders } from "./cache"

let processing = false

const rtf = new Intl.RelativeTimeFormat("default", { numeric: "auto" })

export const whenOpenJournals = (journalsEle: HTMLDivElement, versionMd: boolean) => {
    if (processing) return
    processing = true
    setTimeout(() =>
        processing = false, 1000)

    // 清空 TOC 内容区域并重建日志标题列表
    const element = parent.document.getElementById("lse-toc-content") as HTMLDivElement | null
    if (element && journalsEle) {
        clearCachedHeaders()
        element.innerHTML = ""

        // 清除原生大纲可能遗留的顶部“页面名称”标题组（例如从“试验1”切到日志页时，保留了“试验1”的挂载节点）
        const headerSpace = parent.document.getElementById("lse-toc-header-space")
        if (headerSpace) headerSpace.replaceChildren()

        getJournalTitles(journalsEle, element, versionMd)
        return
    }

    clearTOC()
}


const getJournalTitles = (journalsEle: HTMLDivElement, tocContentEle: HTMLDivElement, versionMd: boolean) => {
    // 显示处理
    updateJournalList(journalsEle, tocContentEle, versionMd)

    // 当主内容区域滚动时，更新日志标题列表
    const mainContentContainer = parent.document.getElementById("main-content-container") as HTMLDivElement | null
    if (mainContentContainer) {
        // 滚动事件处理函数
        const scrollEvent = () => {
            const journalsEle = parent.document.getElementById("journals") as HTMLDivElement | null // 获取日志容器元素
            if (journalsEle)
                updateJournalList(journalsEle, tocContentEle, versionMd) // 更新日志列表
            else
                mainContentContainer.removeEventListener("scroll", scrollEvent) // 日志不存在时解除事件监听
        }
        mainContentContainer.addEventListener("scroll", scrollEvent)
    }
}


const updateJournalList = (journalsEle: HTMLDivElement, tocContentEle: HTMLDivElement, versionMd: boolean) => {
    tocContentEle.innerHTML = ""
    const ulEle = document.createElement("ul")
    //list-style
    ulEle.style.listStyle = "disc"
    ulEle.style.marginLeft = "3em"

    const journalTitles = journalsEle.querySelectorAll(versionMd === true ? "a.journal-title" : "div.ls-page-title span.block-title-wrap,div#journals div.is-journals h1.page-title>span") as NodeListOf<HTMLAnchorElement>

    journalTitles.forEach((journalTitle) => {
        const title = journalTitle.textContent
        if (title) {
            journalTitle.id = title
            const journalTitleEle = document.createElement("li")
            journalTitleEle.className = "journal-title"
            const date = new Date(title)
            // 日期解析失败时
            if (isNaN(date.getTime())) {
                // 日期无效，仅显示标题文本
                journalTitleEle.textContent = title
                journalTitleEle.title = "Ctrl-> Open single page"
            } else {
                // 使用 Intl.RelativeTimeFormat 将日期差转换为本地化的相对时间字符串
                const diff = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                journalTitleEle.innerHTML = title + "<span style='font-size:small;margin-left:1.5em'>" + rtf.format(Math.round(diff), "day") as string + "</span>"

                // 使用 Intl.DateTimeFormat 显示星期几
                const dayOfWeekStr = new Intl.DateTimeFormat("default", { weekday: "long" }).format(date)
                journalTitleEle.title = dayOfWeekStr + "\n\n" + "Ctrl-> Open single page"
            }

            journalTitleEle.style.cursor = "pointer"
            journalTitleEle.onclick = async (ev) => {
                logseq.showMainUI() // 防双击误触
                setTimeout(() => {
                    logseq.hideMainUI()
                }, 100)
                ev.preventDefault()

                if (ev.shiftKey)
                    pageOpen(title, ev.shiftKey, false)
                else
                    if (ev.ctrlKey)
                        pageOpen(title, false, false)
                    else {
                        const cancelButtonEle = parent.document.getElementById("cancel-exclude") as HTMLButtonElement | null // 兼容 Single Journal 插件
                        if (cancelButtonEle) cancelButtonEle.click()

                        const journalEle = parent.document.getElementById(title) as HTMLAnchorElement | null
                        if (journalEle) {
                            scrollToWithOffset(journalEle) // 使用通用滚动函数
                            // 滚动后高亮标题短暂提示
                            journalEle.style.backgroundColor = "var(--ls-selection-background-color)"
                            setTimeout(() => journalEle.style.backgroundColor = "", 1200)
                        }
                    }
            }
            ulEle.appendChild(journalTitleEle)
        }
    })
    tocContentEle.appendChild(ulEle)
}
