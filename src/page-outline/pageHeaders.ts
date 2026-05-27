import { BlockEntity } from "@logseq/libs/dist/LSPlugin.user"
import { booleanLogseqVersionMd } from ".."
import { settingKeys } from '../settings/keys'
import { isHeadersCacheEqual, setCachedHeaders } from "./cache"
import { clearTOC } from "./DOM"
import { getTocBlocks, getTocBlocksForDb } from "./findHeaders"
import { createHeaderElement } from "./headerItem"
import { getHeaderLevel, isHeader } from "./regex"
import { headerRightButtons, contentTopButtons, generatePageButton } from "./toggleHeader"
import { clearZoomMarks, updateZoomMark } from "./zoom"


// DOM 元素 ID 常量
export const keyToolbarHeaderSpace = "lse-toc-header-space" // 页面名称显示区域
export const keyToggleTableId = "thfpc--toggleHeader"       // 标题级别切换表格
export const keyToggleH = "tabbedHeadersToggleH"             // 标题级别切换按钮前缀
/** TOC 块数据结构：从 Logseq 块树中提取的标题信息 */
export interface TocBlock {
  content: string                                          // 块原始内容
  uuid: string                                             // 块唯一标识
  properties?: { [key: string]: string[] | string }        // 块属性
  [":logseq.property/heading"]?: number                     // 数据库模式下的标题等级
}
/** 块树子节点接口：代表页面块树中的一个节点及其子节点 */
export interface Child {
  content: string
  uuid: string
  properties?: { [key: string]: string[] | string }
  children?: Child[]
}



/**
 * 刷新侧边栏大纲列表的核心函数
 * 流程：显示页面标题 → 获取块树 → 提取标题 → 过滤 → 渲染元素 → 注册监听
 * @param pageName - 页面名称
 * @param zoom - 可选的缩放信息
 */
export const refreshPageHeaders = async (pageName: string, zoom?: { zoomIn: boolean, zoomInUuid: BlockEntity["uuid"] }) => {

  const element = parent.document.getElementById("lse-toc-content") as HTMLDivElement | null
  if (element) {

    // 始终显示页面名称标题
    generatePageButton(element)

    const versionMd = booleanLogseqVersionMd()
    // 获取当前页面的完整块树
    const blocks = await logseq.Editor.getPageBlocksTree(pageName) as Child[]
    // 从块树中提取含有标题的块
    let headers: TocBlock[]
    let versionDbMdGraphFlag = false
    if (versionMd === true)
      // Markdown 模式：通过 # 语法检测标题
      headers = getTocBlocks(blocks)
    else {
      // 数据库模式：优先使用数据库特有的标题属性
      const dbGraph = getTocBlocksForDb(blocks)
      if (dbGraph.length > 0)
        headers = dbGraph
      else {
        // 回退到 Markdown 语法检测（混合模式图谱）
        headers = getTocBlocks(blocks)
        versionDbMdGraphFlag = true
      }
    }

    // Markdown 模式下，仅保留包含有效标题记号（# ~ ######）的块
    if ((versionMd === true
      || versionDbMdGraphFlag === true)
      && headers.length > 0)
      headers = headers.filter((block) => {
        const headerLevel = getHeaderLevel(block.content)
        return headerLevel > 0 && headerLevel <= 6
      })

    // 有标题时：渲染大纲（纯按钮触发，不自动编号，不注册监听器）
    if (headers.length > 0) {
      await updateHeadingElements(element, headers as TocBlock[], pageName, versionMd, zoom ? zoom : undefined)
    } else
      // 无标题时：清空大纲区域
      clearTOC()
  }

}



/**
 * 更新 TOC 容器中的标题元素
 * 使用缓存机制避免无谓的 DOM 重绘，仅当标题内容发生变化时才重新渲染
 */
const updateHeadingElements = async (
  targetElement: HTMLElement,
  tocBlocks: TocBlock[],
  thisPageName: string,
  versionMd: boolean,
  zoom?: { zoomIn: boolean; zoomInUuid: BlockEntity["uuid"] }
): Promise<void> => {

  // 重置缩放标记
  clearZoomMarks()

  // 与缓存对比，若未变化则跳过 DOM 更新
  if (isHeadersCacheEqual(tocBlocks)) {
    updateZoomMark(zoom, targetElement)
    return
  }

  // 更新缓存
  setCachedHeaders(tocBlocks)

  // 清空现有 DOM
  targetElement.innerHTML = ""

  // 渲染顶部操作按钮（上移/下移/标题层级过滤）
  targetElement.append(contentTopButtons())

  // 用于标题悬停高亮的动态 CSS（当前未使用，留作扩展）
  let css = ""

  // 遍历标题块，逐个创建并追加大纲元素
  for (const tocBlock of tocBlocks) {
    if (isHeader(tocBlock.content, tocBlock, versionMd)) {
      const element = createHeaderElement(tocBlock.content, tocBlock, versionMd, thisPageName, zoom)
      targetElement.append(element)
    }
  }

  // 如果生成了动态 CSS，则以 style 标签的形式注入到 TOC 容器中
  if (css !== "") {
    const styleElement = document.createElement("style")
    styleElement.innerHTML = css
    targetElement.appendChild(styleElement)
  }

}

