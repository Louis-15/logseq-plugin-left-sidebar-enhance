import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { commonSettings } from './settings/common'
import { tocSettings } from './settings/toc'

export const settingsTemplate = (logseqVersionMd: boolean, currentSettings?: Record<string, unknown>): SettingSchemaDesc[] => {
    // build parts (toc, common) so each can read currentSettings
    const toc = tocSettings(logseqVersionMd, currentSettings)
    const common = commonSettings(currentSettings)

    // merge in desired order: common, then toc
    return [...common, ...toc]
}
