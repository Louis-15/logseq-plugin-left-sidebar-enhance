import { BlockEntity } from "@logseq/libs/dist/LSPlugin"
import { settingKeys } from '../settings/keys'
import { TocBlock } from "./pageHeaders"
import { loadEmbedContents } from "./loadEmbedContents"
import { generateHeaderElement, processText } from "./regex"
import { selectBlock } from "./selectBlock"
import { createElementWithAttributes } from "../util/domUtils"



/**
 * 创建并配置一个大纲标题元素
 * 根据内容和属性生成对应级别的 H 标签，绑定点击跳转事件和双向高亮链接
 * @param content - 块原始内容
 * @param tocBlock - TOC 块数据
 * @param versionMd - 是否为 Markdown 模式
 * @param thisPageName - 当前页面名称
 * @param zoom - 可选的缩放信息
 */
export const createHeaderElement = (
  content: string,
  tocBlock: TocBlock,
  versionMd: boolean,
  thisPageName: string,
  zoom?: { zoomIn: boolean; zoomInUuid: BlockEntity["uuid"] }
): HTMLElement => {

  let element: HTMLElement
  if (versionMd) {
    element = generateHeaderElement(content)
  } else {
    const headerLevel = tocBlock[":logseq.property/heading"] as number | 0
    element = headerLevel > 0 && headerLevel <= 6
      ? document.createElement(`h${headerLevel}`)
      : generateHeaderElement(content)
  }

  // 添加 CSS 类名（用于样式匹配）和块 UUID 属性（用于光标追踪高亮）
  element.classList.add("left-toc-" + element.tagName.toLowerCase(), "cursor")
  element.setAttribute("data-uuid", tocBlock.uuid)

  // 异步加载嵌入内容
  loadEmbedContents(content, tocBlock.uuid)

  // 提取标题文本（取第一行，并过滤 Markdown 标记）
  const headerText = processText(content.includes("\n") ? content.split("\n")[0] : content)

  // 添加缩放标记图标（当前块处于缩放模式时显示放大镜图标）
  const markElement = createElementWithAttributes("span", {
    class: "zoom-mark",
    style: `display: ${zoom && zoom.zoomIn && zoom.zoomInUuid === tocBlock.uuid ? "inline" : "none"}`,
  }, "🔍")
  element.title = headerText // 鼠标悬停提示

  element.appendChild(markElement)
  element.innerHTML += headerText
  // 点击事件：普通点击跳转、Shift+点击在侧边栏打开、Ctrl+点击缩放
  element.addEventListener("click", ({ shiftKey, ctrlKey }) => selectBlock(shiftKey, ctrlKey, thisPageName, tocBlock.uuid))

  // 建立侧边栏大纲项与正文块的双向链接（悬停高亮等）
  headerItemLink([tocBlock], 0, element)

  return element

}



/**
 * 建立大纲项与正文块的双向交互链接
 * 包括：鼠标悬停大纲项时高亮正文对应块、以及监听 DOM 变化重新注册
 */
const headerItemLink = (tocBlocks: TocBlock[], i: number, element: HTMLElement) => {

  // 构建选择器：定位正文中对应 UUID 的块元素
  const selector = `#main-content-container div.page div.blocks-container div.ls-block[level][blockid="${tocBlocks[i].uuid}"]`

  const addHoverListeners = () => {
    const pageHeader = parent.document.querySelector(selector) as HTMLElement | null
    // 功能1：鼠标悬停在侧边栏标题上时，高亮正文对应的数据块
    if (logseq.settings?.[settingKeys.toc.highlightBlockOnHover] === true && pageHeader) {
      element.addEventListener("mouseover", () => {
        pageHeader.style.outline = "6px solid var(--ls-block-highlight-color)"
        pageHeader.style.outlineOffset = "6px"
      })
      element.addEventListener("mouseout", () => {
        pageHeader.style.outline = "unset"
        pageHeader.style.outlineOffset = "unset"
      })
    }

    // 功能2：光标焦点追踪高亮（已迁移至 setup.ts 中的全局 focusin 监听器）
    if (logseq.settings?.[settingKeys.toc.highlightHeaderOnHover] === true) {
      const headerItemElement = parent.document.querySelector(selector) as HTMLDivElement | null
      if (headerItemElement) {
        // 原来的鼠标悬停反向高亮已被废除，改用 focusin 全局监听管理的光标捕获高亮方案
      }
    }
  }

  // 初始注册事件监听
  addHoverListeners()

  // 监听 DOM 变化并重新注册事件（当正文块被 Logseq 重新渲染时，原有绑定会失效）
  const observer = new MutationObserver(() => {
    addHoverListeners()
  })

  const targetNode = parent.document.querySelector("#main-content-container") as HTMLElement | null
  if (targetNode) {
    observer.observe(targetNode, { childList: true, subtree: true })
  }

}
