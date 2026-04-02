import { scrollToWithOffset } from "../util/domUtils"
import { expandAndScrollToBlock } from "./collapsedBlock"

// 点击左侧边栏标题的行为处理
// 普通点击：页面内跳转到对应标题位置
// Ctrl+点击：以缩放页面方式打开该标题块
// Shift+点击：在右侧边栏中打开该标题块
export const selectBlock = async (shiftKey: boolean, ctrlKey: boolean, pageName: string, blockUuid: string) => {
  await logseq.Editor.setBlockCollapsed(blockUuid, false)

  if (shiftKey) {
    // Shift+点击：在右侧边栏打开
    logseq.Editor.openInRightSidebar(blockUuid)
  } else if (ctrlKey) {
    // Ctrl+点击：进入缩放页面
    logseq.App.pushState("page", { name: blockUuid })
  } else {
    // 普通点击：页面内滚动跳转到对应标题位置
    await logseq.Editor.selectBlock(blockUuid)
    const elem = parent.document.getElementById('block-content-' + blockUuid) as HTMLDivElement | null
    if (elem) {
      logseq.Editor.exitEditingMode()
      scrollToWithOffset(elem)
      return
    }

    // 如果标题被折叠，展开并滚动到目标位置
    await expandAndScrollToBlock(blockUuid, true)
  }
}
