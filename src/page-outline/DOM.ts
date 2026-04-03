import { t } from "logseq-l10n"
import { clearCachedHeaders } from "./cache"


// 清空 TOC 内容区域，并显示"无标题"提示信息
export const clearTOC = () => {
  clearCachedHeaders()
  const element = parent.document.getElementById("lse-toc-content") as HTMLDivElement | null
  if (element)
    element.innerHTML = t("No headers found")
}
