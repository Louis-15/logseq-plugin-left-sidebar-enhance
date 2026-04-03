import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { t } from 'logseq-l10n'
import { settingKeys } from './keys'

export const commonSettings = (currentSettings?: Record<string, unknown>): SettingSchemaDesc[] => {
             const cfg = currentSettings ?? {}
             const list: SettingSchemaDesc[] = []
             list.push(
                          {
                                       key: 'headingSidebarEnhance',
                                       title: '一、侧边栏增强',
                                       type: 'heading',
                                       default: null,
                                       description: '所有跟侧边栏显示/交互相关的增强功能',
                          },
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

             list.push(
               {// Master enable
                   key: settingKeys.toc.master,
                   title: '启用侧边栏页面大纲',
                   type: 'boolean',
                   default: true,
                   description: '启用',
               })

             if (cfg[settingKeys.toc.master] === true) {
                 list.push(
                     {
                         key: settingKeys.toc.highlightBlockOnHover,
                         title: '鼠标悬停在标题上时高亮显示数据块',
                         type: 'boolean',
                         default: true,
                         description: '鼠标悬停在标题列表中的标题时，高亮显示相应的数据块。',
                     },
                     {
                         key: settingKeys.toc.highlightHeaderOnHover,
                         title: '鼠标悬停在数据块上时高亮显示标题',
                         type: 'boolean',
                         default: true,
                         description: '当鼠标悬停在页面中的块上时，在标题列表中突出显示相应的标题。',
                     },
                     {
                         key: settingKeys.toc.enableJournalsList,
                         title: '显示日记列表',
                         type: 'boolean',
                         default: true,
                         description: '切换以显示或隐藏日记中的日期列表。',
                     })
             }
             return list
}
