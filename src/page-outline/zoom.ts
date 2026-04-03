import { BlockEntity } from "@logseq/libs/dist/LSPlugin"
import { expandAndScrollToBlock } from "./collapsedBlock"


/**
 * 清除 TOC 中所有的缩放标记
 */
export const clearZoomMarks = () => {
  const zoomedElements = parent.document.querySelectorAll("#lse-toc-content [data-uuid]")
  zoomedElements.forEach((el) => {
    const markElement = el.querySelector(".zoom-mark") as HTMLElement | null
    if (markElement) markElement.style.display = "none" // 隐藏标记
  })
}


export const updateZoomMark = (zoom: { zoomIn: boolean; zoomInUuid: BlockEntity["uuid"] } | undefined, targetElement: HTMLElement) => {
  if (zoom) {
    const zoomedElements = targetElement.querySelectorAll("[data-uuid]")
    zoomedElements.forEach((el) => {
      const markElement = el.querySelector(".zoom-mark") as HTMLElement | null
      if (markElement) markElement.style.display = "none" // 隐藏标记
    })

    if (zoom.zoomIn && zoom.zoomInUuid) {
      const zoomedElement = targetElement.querySelector(`[data-uuid="${zoom.zoomInUuid}"]`) as HTMLElement | null
      if (zoomedElement) {
        const markElement = zoomedElement.querySelector(".zoom-mark") as HTMLElement | null
        if (markElement) markElement.style.display = "inline"
      }
    }
  }
}


export const whenZoom = (pageName: string, blockUuid: string) => {
  const zoomPageElement = parent.document.querySelector("#main-content-container div.page div.breadcrumb") as HTMLElement | null
  if (zoomPageElement) {
    logseq.Editor.scrollToBlockInPage(pageName, blockUuid, { replaceState: true })
  } else {
    expandAndScrollToBlock(blockUuid, true)
  }
}
