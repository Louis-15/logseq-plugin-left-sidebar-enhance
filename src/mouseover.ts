import { ExternalCommandType, LSPluginBaseInfo } from "@logseq/libs/dist/LSPlugin"
import { t } from "logseq-l10n"
import CSSTypeA from "./mouseoverA.css?inline"
import CSSTypeB from "./mouseoverB.css?inline"
import { settingKeys } from './settings/keys'
import { removeProvideStyle } from "./util/lib"
const keyShowByMouseOver = "showByMouseOver"
let processingMouseOverButton = false

export const loadShowByMouseOver = () => {

    setTimeout(() => {
        logseq.App.onAfterCommandInvoked("logseq.ui/toggle-left-sidebar" as ExternalCommandType, () => {
            if (logseq.settings?.[settingKeys.common.loadShowByMouseOver] === true)
                whenToggleEvent()
        })
    }, 1000)

    if (logseq.settings?.[settingKeys.common.loadShowByMouseOver] === true) {
        if (logseq.settings?.toggleShowByMouseOver === "mouseOver") {
            injectHoverCSS()
            logseq.App.setLeftSidebarVisible(true)
        } else {
            removeProvideStyle(keyShowByMouseOver)
            // 不强制覆盖原生状体，让其自然呈现
        }
        handleEvent(1000)
    }

}

const injectHoverCSS = () => {
    // 默认使用原 Type B 方案 (sethyuan 极致紧凑弹出风格)
    logseq.provideStyle({ key: keyShowByMouseOver, style: CSSTypeB })
}

const handleEvent = (time: number) => {
    setTimeout(() => {
        if (processingMouseOverButton === true) return
        const button = parent.document.getElementById("left-menu") as HTMLButtonElement | null
        if (!button) {
            console.warn("button is null")
            return
        }
        button.addEventListener("click", whenToggleEvent)
        processingMouseOverButton = true
    }, time)
}

const whenToggleEvent = () => {
    if (logseq.settings!.loadShowByMouseOver === false) return 

    if (logseq.settings!.toggleShowByMouseOver !== "mouseOver") {
        // 当前是常规展开，切换为悬停隐藏模式
        logseq.updateSettings({ toggleShowByMouseOver: "mouseOver" })
        setTimeout(() => {
            logseq.App.setLeftSidebarVisible(true) // 强制原生开启以供 CSS 接管
            injectHoverCSS()
        }, 10)
    } else {
        // 当前是悬停隐藏模式，切换回常规展开
        logseq.updateSettings({ toggleShowByMouseOver: "normal" })
        setTimeout(() => {
            removeProvideStyle(keyShowByMouseOver)
            logseq.App.setLeftSidebarVisible(true) // 恢复原生展开
        }, 10)
    }
}

/**
 * 设置变更时的处理函数（由中央分发器调用）
 * 检测悬停弹出功能的开关状态变化，并相应地注入/移除 CSS 样式
 */
export const handleMouseoverSettingsChanged = async (newSet: LSPluginBaseInfo['settings'], oldSet: LSPluginBaseInfo['settings']): Promise<void> => {
    // 当用户在设置中将悬停弹出功能从关闭切换为开启时，强制启用悬停模式
    if (oldSet[settingKeys.common.loadShowByMouseOver] === false
        && newSet[settingKeys.common.loadShowByMouseOver] === true) {
        logseq.updateSettings({ toggleShowByMouseOver: "mouseOver" })
        setTimeout(() => {
            logseq.App.setLeftSidebarVisible(true)
            injectHoverCSS()
            handleEvent(100) // 确保挂载了点击事件
        }, 10)
    }
    else if (oldSet[settingKeys.common.loadShowByMouseOver] === true
             && newSet[settingKeys.common.loadShowByMouseOver] === false) {
        removeProvideStyle(keyShowByMouseOver)
        logseq.updateSettings({ toggleShowByMouseOver: "normal" }) // 重置为原生状态
        setTimeout(() => {
            logseq.App.setLeftSidebarVisible(true) // 让其呈现原生的打开状态
        }, 10)
    }
}