import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { t } from 'logseq-l10n'
import { settingKeys } from './keys'

export const tocSettings = (logseqVersionMd: boolean, currentSettings?: Record<string, unknown>): SettingSchemaDesc[] => {
    const cfg = currentSettings ?? {}
    const list: SettingSchemaDesc[] = []

    list.push(
        {// Section header
            key: settingKeys.toc.heading,
            title: '二、自动标题等级调整',
            type: 'heading',
            default: null,
            description: '点击标题上方的「重新编号」按钮手动触发编号，此为纯辅助设置',
        })

    if (cfg[settingKeys.toc.master] === true) {
        if (logseqVersionMd) {

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
