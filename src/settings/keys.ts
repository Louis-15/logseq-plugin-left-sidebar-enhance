export const settingKeys = {
             toc: {
                          heading: 'heading00Toc',
                          master: 'booleanLeftTOC',
                          booleanAsZoomPage: 'booleanAsZoomPage',
                          highlightBlockOnHover: 'highlightBlockOnHover',
                          highlightHeaderOnHover: 'highlightHeaderOnHover',
                          enableJournalsList: 'enableJournalsList',

                          // Auto heading level adjustment
                          autoHeadingLevelEnabled: 'autoHeadingLevelEnabled',
                          autoHeadingLevelPreset: 'autoHeadingLevelPreset',
                          autoHeadingLevelReserveH1: 'autoHeadingLevelReserveH1',
             },
             common: {
                          booleanFavAndRecent: 'booleanFavAndRecent',
                          loadShowByMouseOver: 'loadShowByMouseOver',
                          showByMouseOverType: 'showByMouseOverType',
             },
} as const

export type SettingKeys = typeof settingKeys
