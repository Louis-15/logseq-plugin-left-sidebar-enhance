import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { t } from 'logseq-l10n'
import { settingKeys } from './keys'

export const visualTimerSettings = (currentSettings?: Record<string, unknown>): SettingSchemaDesc[] => {
             const cfg = currentSettings ?? {}
             const list: SettingSchemaDesc[] = []

             list.push(
                          {// Heading
                                       key: settingKeys.visualTimer.heading,
                                       title: '可视化计时器设置',
                                       type: 'heading',
                                       default: null,
                                       description: '',
                          },
                          { // Master toggle
                                       key: settingKeys.visualTimer.master,
                                       title: '在左侧边栏启用可视化计时器',
                                       type: 'boolean',
                                       default: false,
                                       description: '显示剩余时间环形进度条。',
                          })

             if (cfg[settingKeys.visualTimer.master] === false) return list

             // Day window
             list.push({
                          key: settingKeys.visualTimer.enableDayWindow,
                          title: '启用日间进度条',
                          type: 'boolean',
                          default: true,
                          description: '显示一个每日时间窗口的倒数进度条。',
             })

             if (cfg[settingKeys.visualTimer.enableDayWindow] === true) {
                          list.push(
                                       {
                                                    key: settingKeys.visualTimer.dayWindowStartHour,
                                                    title: '日间起始小时',
                                                    type: 'number',
                                                    default: 5,
                                                    description: '日间的起始小时 (0-23)。',
                                       },
                                       {
                                                    key: settingKeys.visualTimer.dayWindowEndHour,
                                                    title: '就寝小时',
                                                    type: 'number',
                                                    default: 24,
                                                    description: '就寝小时 (1-24)。24 代表午夜。',
                                       })
             }

             // Weekday-range progress bar removed

             // Target date
             list.push({
                          key: settingKeys.visualTimer.enableTargetDate,
                          title: '启用目标日期进度条',
                          type: 'boolean',
                          default: true,
                          description: '显示一个到达目标日期的倒计时进度条。',
             })

             if (cfg[settingKeys.visualTimer.enableTargetDate] === true) {
                          list.push({
                                       key: settingKeys.visualTimer.targetDate,
                                       title: '目标日期',
                                       type: 'string',
                                       inputAs: 'date',
                                       default: '',
                                       description: '挑选倒计时的目标日期。进度计算至当日 00:00。',
                          })
             }

             return list
}
