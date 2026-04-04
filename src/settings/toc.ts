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
        if (logseqVersionMd) {

            list.push(
                {
                    key: settingKeys.toc.headingNumberFileEnable,
                    title: '启用标题自动编号',
                    type: 'enum',
                    enumChoices: ['全局自动编号', '单页面手动开关', '关闭自动编号'],
                    default: '关闭自动编号',
                    description: '自动将层级编号添加到 Markdown 文件中的标题文本，会直接修改笔记文本。',
                })


            // 自动标题等级调整
            list.push(
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
