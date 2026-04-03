import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { t } from 'logseq-l10n'
import { settingKeys } from './keys'

export const tocSettings = (logseqVersionMd: boolean, currentSettings?: Record<string, unknown>): SettingSchemaDesc[] => {
    const cfg = currentSettings ?? {}
    const list: SettingSchemaDesc[] = []

    list.push(
        {// Section header
            key: settingKeys.toc.heading,
            title: '二、自动编号相关',
            type: 'heading',
            default: null,
            description: '所有跟自动大纲编号相关的设置',
        })

    if (cfg[settingKeys.toc.master] === true) {
        list.push(
            {
                key: settingKeys.toc.tocRemoveWordList,
                title: '要从标题列表中排除的单词',
                type: 'string',
                inputAs: 'textarea',
                default: '',
                description: '输入要排除的词，用换行符分隔。',
            })

        if (logseqVersionMd) {

            list.push(
                {
                    key: settingKeys.toc.headingNumberFileEnable,
                    title: '启用标题编号 (文件更新模式，仅支持本地图谱)',
                    type: 'boolean',
                    default: false,
                    description: '自动将层级编号添加到 Markdown 文件中的标题文本。仅适用于本地基于文件的图谱。',
                })

            if (cfg[settingKeys.toc.headingNumberFileEnable] === true) {
                list.push(
                    {
                        key: settingKeys.toc.headingNumberDelimiterFile,
                        title: '标题编号分隔符 (文件更新模式，新)',
                        type: 'string',
                        default: '.',
                        description: '更新文件时标题编号使用的新分隔符',
                    },
                    {
                        key: settingKeys.toc.headingNumberDelimiterFileOld,
                        title: '标题编号分隔符 (文件更新模式，旧)',
                        type: 'string',
                        default: '.',
                        description: '重新计算标题编号时要检测和替换的旧分隔符',
                    })
            }

            list.push(
                {
                    key: settingKeys.toc.pageStateStorageMode,
                    title: '页面激活状态存储模式',
                    type: 'enum',
                    enumChoices: ['storeTrueOnly', 'storeFalseOnly'],
                    enumPicker: 'select',
                    default: 'storeTrueOnly',
                    description: 'storeTrueOnly: 仅存储已启用的页面。storeFalseOnly: 默认启用，仅存储禁用的页面。',
                },
                {
                    key: settingKeys.toc.pageStates,
                    title: '页面激活状态',
                    type: 'object',
                    default: {},
                    description: '每页激活状态的内部存储。由工具栏图标管理。',
                },
                // Auto heading level adjustment
                {
                    key: settingKeys.toc.autoHeadingLevelEnabled,
                    title: '启用自动调整标题等级',
                    type: 'boolean',
                    default: false,
                    description: '根据缩进层级自动调整 Markdown 标题等级',
                })

            if (cfg[settingKeys.toc.autoHeadingLevelEnabled] === true) {
                list.push(
                    {
                        key: settingKeys.toc.autoHeadingLevelPreset,
                        title: '标题等级范围预设',
                        type: 'enum',
                        enumChoices: ['h2-h6', 'h1-h3', 'h2-h4'],
                        enumPicker: 'select',
                        default: 'h2-h6',
                        description: '选择标准化时要使用的标题等级范围',
                    },
                    {
                        key: settingKeys.toc.autoHeadingLevelReserveH1,
                        title: '保留 H1 给页面标题',
                        type: 'boolean',
                        default: false,
                        description: '启用后，H1 将预留给页面标题，内容标题从 H2 开始',
                    })
            }
        }
    }

    return list
}
