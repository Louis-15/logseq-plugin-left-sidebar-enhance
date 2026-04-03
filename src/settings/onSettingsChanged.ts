import { LSPluginBaseInfo } from '@logseq/libs/dist/LSPlugin.user'
import { handleTocSettingsChanged } from '../page-outline/setup'
import { handleMouseoverSettingsChanged } from '../mouseover'
import { handleFavAndRecentSettingsChanged } from '../favAndRecent'
import { handleHeadingNumberingSettingsChanged } from '../heading-numbering'
import { handleAutoHeadingLevelSettingsChanged } from '../auto-heading-level'
import { settingsTemplate } from '../settings'
import { booleanLogseqVersionMd } from '..'

/**
 * 中央设置分发器
 * - 插件内各功能模块不单独注册 `logseq.onSettingsChanged`，
 *   而是统一由此处唯一的监听器分发到各模块的处理函数。
 * - 这样设置变更的监控点集中在一处，提升可维护性和调试便利性。
 */
export const initSettingsDispatcher = () => {
    logseq.onSettingsChanged(async (newSet: LSPluginBaseInfo['settings'], oldSet: LSPluginBaseInfo['settings']) => {
        let shouldShowSettings = false

        if (shouldShowSettings === false)
            try {
                await handleMouseoverSettingsChanged(newSet, oldSet)
                                       } catch (e) {
                                                    console.error('mouseover settings handler failed', e)
                                       }

                          if (shouldShowSettings === false)
                                       try {
                                                    await handleFavAndRecentSettingsChanged(newSet, oldSet)
                                       } catch (e) {
                                                    console.error('favAndRecent settings handler failed', e)
                                       }
                          if (shouldShowSettings === false)
                                       // Handle heading numbering settings
                                       try {
                                                    const r = await handleHeadingNumberingSettingsChanged(newSet, oldSet)
                                                    if (r === true) shouldShowSettings = true
                                       } catch (e) {
                                                    console.error('heading numbering settings handler failed', e)
                                       }

                          if (shouldShowSettings === false)
                                        // Handle auto heading level settings
                                       try {
                                                    const r = await handleAutoHeadingLevelSettingsChanged(newSet, oldSet)
                                                    if (r === true) shouldShowSettings = true
                                       } catch (e) {
                                                    console.error('auto heading level settings handler failed', e)
                                       }

                          // 主要处理函数报告了设置变更时，重新加载设置 UI
                          if (shouldShowSettings) {
                                       logseq.useSettingsSchema(settingsTemplate(booleanLogseqVersionMd(), newSet))
                                       logseq.hideSettingsUI()
                                       setTimeout(() =>
                                                    logseq.showSettingsUI()
                                                    , 10)
                          }
             })
}

export default initSettingsDispatcher
