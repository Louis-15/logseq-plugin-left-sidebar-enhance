import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { t } from 'logseq-l10n'
import { settingKeys } from './keys'

export const commonSettings = (currentSettings?: Record<string, unknown>): SettingSchemaDesc[] => {
             // const cfg = currentSettings ?? {}
             const list: SettingSchemaDesc[] = []
             list.push(
                          {
                                       key: settingKeys.common.booleanFavAndRecent,
                                       title: '隐藏收藏夹和历史记录中的重复项目',
                                       type: 'boolean',
                                       default: true,
                                       description: '插件启动时和每 10 分钟自动删除 Favorites 和 History 中的重复项。',
                          },
                          {
                                       key: settingKeys.common.loadShowByMouseOver,
                                       type: 'boolean',
                                       title: '当侧边栏隐藏时，是否开启悬停弹出功能',
                                       description: '开启后，点击左上角按钮不再彻底关闭侧边栏，而是变为边缘悬停即可滑出。关闭此项则恢复原生彻底隐藏逻辑。',
                                       default: false,
                          })
             return list
}
