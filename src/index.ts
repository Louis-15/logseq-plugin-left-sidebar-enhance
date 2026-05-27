import '@logseq/libs' //https://plugins-doc.logseq.com/
import { AppInfo, BlockEntity, PageEntity } from '@logseq/libs/dist/LSPlugin'
import { loadFavAndRecent } from './favAndRecent'
import { loadShowByMouseOver } from './mouseover'
import { refreshPageHeaders } from './page-outline/pageHeaders'
import { setupTOCHandlers } from './page-outline/setup'
import { settingsTemplate } from './settings'
import { settingKeys } from './settings/keys'
import { initSettingsDispatcher } from './settings/onSettingsChanged'
import { removeContainer } from './util/lib'
import { loadLogseqL10n } from "./translations/l10nSetup" //https://github.com/sethyuan/logseq-l10n
import { initHeadingNumbering } from './heading-numbering'
import { removeToolbarIcon, updateToolbarIcon } from './heading-numbering/toolbarIcon'
import { initHeadingButtons, cleanupHeadingButtons } from './heading-numbering/headingButtons'
import { initAutoHeadingLevel } from './auto-heading-level'
import { loadConfigFromPage } from './heading-numbering/pageWhitelist'

// 当前页面原始名称（全局状态，供各模块读取）
let currentPageOriginalName: PageEntity["originalName"] = ""
// 当前页面 UUID（用于白名单比对，不受重命名影响）
let currentPageUuid: string = ""

// Logseq 版本号字符串，用于版本兼容性检查
let logseqVersion: string = ""
// 是否为 Markdown 模式（0.10.x 及以下为 true，0.11+ 为数据库模式）
let logseqVersionMd: boolean = false

// 对外暴露的版本模式查询方法
export const booleanLogseqVersionMd = () => logseqVersionMd


/** 更新当前页面状态（由路由检查模块在页面切换时调用） */
export const updateCurrentPage = async (pageName: string, pageUuid: PageEntity["uuid"]) => {
  currentPageOriginalName = pageName
  currentPageUuid = typeof pageUuid === 'string' ? pageUuid : String(pageUuid)
}

/** 获取当前页面原始名称 */
export const getCurrentPageOriginalName = () => currentPageOriginalName

/** 获取当前页面 UUID */
export const getCurrentPageUuid = () => currentPageUuid



/* 插件主入口函数 */
const main = async () => {

  // === 国际化初始化 ===
  // 获取用户首选语言并加载对应的翻译资源
  const { preferredLanguage, preferredDateFormat } = await loadLogseqL10n()

  // 首次安装时自动弹出设置面板，引导用户配置
  if (!logseq.settings)
    setTimeout(() =>
      logseq.showSettingsUI(), 300)

  logseqVersionMd = await checkLogseqVersion()

  // === 设置面板初始化 ===
  // 根据当前设置值动态生成设置模板（控制条件性字段的显示/隐藏）
  logseq.useSettingsSchema(settingsTemplate(logseqVersionMd, logseq.settings ?? undefined))

  // 初始化中央设置变更分发器（将各模块的设置回调集中管理）
  setTimeout(() =>
    initSettingsDispatcher()
    , 500)

  // === 侧边栏大纲（TOC）模块初始化 ===
  setTimeout(() =>
    setupTOCHandlers(logseqVersionMd)
    , 300)

  // === 侧边栏鼠标悬停弹出功能 ===
  loadShowByMouseOver()

  // === 收藏夹和历史记录去重 ===
  loadFavAndRecent()

  // === 标题编号右键菜单（跳过/锁定/重号）注册 ===
  // 【重要】菜单注册必须在所有异步操作之前完成，否则可能因竞态掉注册
  initHeadingButtons()

  // === 层级标题自动编号初始化 ===
  await initHeadingNumbering()

  // === 延时 15 秒后执行孤儿数据清理（不阻塞启动） ===
  setTimeout(async () => {
      try {
          const { cleanUpOrphanedData } = await import('./heading-numbering/pageWhitelist')
          await cleanUpOrphanedData()
      } catch (e) {
          console.warn('[LSE] 孤儿数据清理失败:', e)
      }
  }, 15000)

  // === 标题等级自动调整初始化 ===
  initAutoHeadingLevel()


  // === 插件卸载时的清理工作 ===
  logseq.beforeunload(async () => {
    removeContainer("lse-toc-container")
    removeContainer("lse-dataSelector-container")
    removeToolbarIcon()
    cleanupHeadingButtons()
    parent.document.documentElement.classList.remove('lse-heading-enabled')
  })

  // === 图谱切换时重置状态并重新加载块状态配置 ===
  logseq.App.onCurrentGraphChanged(async () => {
    currentPageOriginalName = ""
    logseqVersionMd = await checkLogseqVersion()
    // 图谱切换后重新加载新图谱的块状态
    await loadConfigFromPage()
  })

}/* end_main */



/**
 * 页面切换/加载时的核心回调函数
 * 负责刷新 TOC、更新工具栏按钮
 * 纯按钮触发模式，不自动编号，不注册后台监听
 * @param pageName - 目标页面名称
 * @param flag - 可选的缩放信息（是否处于缩放模式及对应块 UUID）
 */
export const onPageChangedCallback = async (pageName: string, flag?: { zoomIn: boolean, zoomInUuid: BlockEntity["uuid"] }) => {

  setTimeout(async () => {
    // 1. 刷新侧边栏大纲列表
    if (logseq.settings?.[settingKeys.toc.master] === true)
      await refreshPageHeaders(pageName, flag ? flag : undefined)

    // 2. 显示工具栏「重新编号」按钮
    if (logseqVersionMd === true) {
        updateToolbarIcon(pageName, currentPageUuid)
        parent.document.documentElement.classList.add('lse-heading-enabled')
    }
  }, 50)

}


/**
 * 检测 Logseq 版本，判断是否为 Markdown 模式
 * 版本号格式示例：0.11.0 或 0.11.0-alpha+nightly.20250427
 * 0.10.x 及以下版本使用 Markdown 文件模式，0.11+ 使用数据库模式
 * @returns true 表示 Markdown 模式，false 表示数据库模式
 */
const checkLogseqVersion = async (): Promise<boolean> => {
  const logseqInfo = await logseq.App.getInfo("version") as AppInfo | any
  // 使用正则提取版本号的前三段数字
  const version = logseqInfo.match(/(\d+)\.(\d+)\.(\d+)/)
  if (version) {
    logseqVersion = version[0]

    // 0.10.x 及以下版本 → Markdown 文件模式
    if (logseqVersion.match(/0\.([0-9]|10)\.\d+/)) {
      logseqVersionMd = true
      return true
    } else
      logseqVersionMd = false
  } else
    logseqVersion = "0.0.0"
  return false
}


// Logseq 插件就绪后执行主函数
logseq.ready(main).catch(console.error)