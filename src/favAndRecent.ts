import { LSPluginBaseInfo } from "@logseq/libs/dist/LSPlugin.user"
import { removeProvideStyle } from "./util/lib"
import { settingKeys } from './settings/keys'
const key = "lse-FavAndRecent"
let processing = false

export const loadFavAndRecent = () => {
    // 设置变更由中央分发器统一处理，此处不单独注册

    // 首次执行过滤
    if (logseq.settings?.[settingKeys.common.booleanFavAndRecent] === true)
        filterRecentItems()
}

/**
 * 设置变更时的处理函数（由中央分发器调用）
 * 当 `booleanFavAndRecent` 变更时，启动/停止收藏夹和历史记录的去重过滤
 */
export const handleFavAndRecentSettingsChanged = async (newSet: LSPluginBaseInfo['settings'], oldSet: LSPluginBaseInfo['settings']): Promise<void> => {
    if (oldSet[settingKeys.common.booleanFavAndRecent] !== newSet[settingKeys.common.booleanFavAndRecent])
        if (newSet[settingKeys.common.booleanFavAndRecent] === true)
            filterRecentItems()
        else
            removeProvideStyle(key) // 移除过滤样式
}



const filterRecentItems = async () => {

    if (processing) return
    processing = true
    setTimeout(() => processing = false, 300)


    const favoriteArray = await logseq.App.getCurrentGraphFavorites() as Array<string> | null
    if (favoriteArray && favoriteArray.length > 0) {
        logseq.provideStyle({
            key,
            style: `
                    #left-sidebar div.nav-content-item.recent li[title].recent-item {
                        ${favoriteArray.map((value) => `&[data-ref="${value}"],\n&:has(span.page-title[data-orig-text="${value}"])`).join(", ")} {
                        display: none;
                        }
                    }
                    `})
        // console.log("Hide duplicate favorites and history")
    }

    // 每 10 分钟重新执行一次过滤
    setTimeout(() => {
        if (logseq.settings?.[settingKeys.common.booleanFavAndRecent] === true)
            filterRecentItems()
    }, 600000)

}