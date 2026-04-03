import { t } from "logseq-l10n"
import { createElementWithAttributes } from "../util/domUtils"
import { refreshPageHeaders, keyToggleTableId, keyToggleH, keyToolbarHeaderSpace } from "./pageHeaders"
import { getCurrentPageOriginalName, booleanLogseqVersionMd } from ".."
import { pageOpen } from "../util/lib"
import { clearCachedHeaders } from "./cache"


let processingButton = false

const hideHeaderFromList = (headerName: string) => {
  if (processingButton) return
  processingButton = true
  setTimeout(() => processingButton = false, 300)

  //リストから該当のヘッダーを削除
  toggleHeaderVisibility(headerName)
  //keyToggleの色を赤にする
  const button = parent.document.getElementById(`tabbedHeadersToggle${headerName.toUpperCase()}`) as HTMLButtonElement | null
  if (button)
    button.style.color = button.style.color === "red" ?
      "unset"
      : "red"
}

const toggleHeaderVisibility = (headerName: string) => {
  for (const element of (parent.document.querySelectorAll(`#lse-toc-content ${headerName}`) as NodeListOf<HTMLElement>))
    element.style.display = element.style.display === "none" ?
      "block"
      : "none"
}


export const headerRightButtons = () => {
  const elementButtons = createElementWithAttributes("div", {
    id: "lse-toc-header-buttons",
    class: "flex items-center",
  })

  // Settings button
  const elementSettings = createElementWithAttributes("span", { 
    class: "cursor flex items-center", 
    title: "Settings",
    style: "margin-right: 0.5em;"
  })
  elementSettings.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
  elementSettings.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      if (typeof (logseq as any)?.showSettingsUI === "function") {
        (logseq as any).showSettingsUI()
      }
    } catch (e) {
      console.error("Failed to open settings:", e)
    }
  })
  elementButtons.append(elementSettings)

  // Update button
  const elementUpdate = createElementWithAttributes("span", { 
    class: "cursor flex items-center", 
    title: t("Update the header list") 
  })
  elementUpdate.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
  elementUpdate.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    elementUpdate.style.visibility = "hidden"
    setTimeout(() => (elementUpdate.style.visibility = "visible"), 2000)
    clearCachedHeaders()
    import("./routeCheck").then(m => m.routeCheck(booleanLogseqVersionMd()))
  })
  elementButtons.append(elementUpdate)

  return elementButtons
}

export const contentTopButtons = () => {
  const elementButtons = createElementWithAttributes("div", {
    id: "lse-toc-buttons",
    class: "flex items-center",
  })

  const elementTop = createElementWithAttributes("span", { class: "cursor", title: t("Scroll to top") }, "↑")
  elementTop.addEventListener("click", () => {
    const titleElement = parent.document.querySelector("h1.page-title") as HTMLElement | null
    if (titleElement) titleElement.scrollIntoView({ behavior: "smooth" })
    else {
      const breadcrumbElement = parent.document.querySelector("div.breadcrumb.block-parents") as HTMLElement | null
      if (breadcrumbElement) breadcrumbElement.scrollIntoView({ behavior: "smooth" })
    }
  })
  elementButtons.append(elementTop)

  const elementBottom = createElementWithAttributes("span", { class: "cursor", title: t("Scroll to bottom") }, "↓")
  elementBottom.addEventListener("click", () => {
    const mainContent = parent.document.querySelector("#main-content-container div[tabindex='0'].add-button-link-wrap") as HTMLElement | null
    if (mainContent) mainContent.scrollIntoView({ behavior: "smooth" })
  })
  elementButtons.append(elementBottom)

  const elementForHideHeader = document.createElement("span")
  const elementHeaderTable = createElementWithAttributes("table", {
    id: keyToggleTableId,
    style: "margin-left: auto; margin-right: auto;",
  })
  const tableRow = document.createElement("tr")

  for (let level = 1; level <= 4; level++) {
    const th = document.createElement("th")
    const button = createElementWithAttributes(
      "button",
      { id: keyToggleH + level, title: t("Toggle for hide") },
      `h${level}`
    )
    button.addEventListener("click", () => hideHeaderFromList("h" + level.toString()))
    th.appendChild(button)
    tableRow.appendChild(th)
  }

  elementHeaderTable.appendChild(tableRow)
  elementForHideHeader.append(elementHeaderTable)
  elementButtons.append(elementForHideHeader)

  return elementButtons
}


export const generatePageButton = (element: HTMLElement) => {
  const currentPageOriginalName = getCurrentPageOriginalName()
  if (currentPageOriginalName === "") return

  let headerSpace = parent.document.getElementById(keyToolbarHeaderSpace) as HTMLElement | null
  if (!headerSpace) {
    headerSpace = createElementWithAttributes("div", {
      id: keyToolbarHeaderSpace,
      class: "flex items-center",
    })
    element.insertAdjacentElement("beforebegin", headerSpace)
  }

  if (headerSpace) {
    // 既存のボタンが残っていると重複するため、クリアしてから追加する
    const openButton = createElementWithAttributes(
      "button",
      {
        title: currentPageOriginalName,
        class: "button",
        style: "white-space: nowrap",
      },
      currentPageOriginalName
    )
    openButton.addEventListener("click", ({ shiftKey }) => pageOpen(currentPageOriginalName, shiftKey, false))
    // replaceChildrenで既存の子要素を置き換え、一つのみになるようにする
    headerSpace.replaceChildren(openButton)
  }
}

