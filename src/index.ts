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
import { initHeadingNumbering, applyHeadingNumbersToPage, cleanupPageHeadingNumbers } from './heading-numbering'
import { removeToolbarIcon, updateToolbarIcon } from './heading-numbering/toolbarIcon'
import { initHeadingButtons, cleanupHeadingButtons } from './heading-numbering/headingButtons'
import { initAutoHeadingLevel } from './auto-heading-level'

// 当前页面原始名称（全局状态，供各模块读取）
let currentPageOriginalName: PageEntity["originalName"] = ""
// let currentPageUuid: PageEntity["uuid"] = ""

// Logseq 版本号字符串，用于版本兼容性检查
let logseqVersion: string = ""
// 是否为 Markdown 模式（0.10.x 及以下为 true，0.11+ 为数据库模式）
let logseqVersionMd: boolean = false

// 对外暴露的版本模式查询方法
export const booleanLogseqVersionMd = () => logseqVersionMd

/**
 * 切换指定页面的自动编号授权状态
 * @param pageName - 页面名称
 * @param forceState - 可选，强制指定目标状态（true=启用, false=关闭）
 * @returns 切换后的新状态
 */
export const togglePageState = async (pageName: string, forceState?: boolean) => {
    let settings = logseq.settings?.pageSwitch as Record<string, boolean> || {}
    const currentState = settings[pageName] || false
    const newState = forceState !== undefined ? forceState : !currentState
    
    settings[pageName] = newState
    logseq.updateSettings({ pageSwitch: settings })

    // 同步给 body 一个类名，便于全页各种 CSS 做状态联动（比如顶部授权按钮置灰等）
    if (newState) {
        parent.document.documentElement.classList.add('lse-heading-enabled')
    } else {
        parent.document.documentElement.classList.remove('lse-heading-enabled')
        // 关闭编号时，自动清理该页面已有的编号文本
        const delimiterSetting = logseq.settings?.[settingKeys.toc.headingNumberDelimiterFileOld]
        const oldDelimiter: string = typeof delimiterSetting === 'string' ? delimiterSetting : '.'
        await cleanupPageHeadingNumbers(pageName, oldDelimiter)
    }

    return newState
}

/** 更新当前页面状态（由路由检查模块在页面切换时调用） */
export const updateCurrentPage = async (pageName: string, pageUuid: PageEntity["uuid"]) => {
  currentPageOriginalName = pageName
  // currentPageUuid = pageUuid
}

/** 获取当前页面原始名称 */
export const getCurrentPageOriginalName = () => currentPageOriginalName



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

  // === 层级标题自动编号初始化 ===
  await initHeadingNumbering()

  // === 标题编号右键菜单（跳过/锁定/重号）注册 ===
  initHeadingButtons()

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

  // === 图谱切换时重置状态 ===
  logseq.App.onCurrentGraphChanged(async () => {
    currentPageOriginalName = ""
    logseqVersionMd = await checkLogseqVersion()
  })

}/* end_main */


// ===================== 数据库变更监听（TOC 实时刷新） =====================

// 防抖锁：TOC 更新过程中如果再次触发变更，则跳过后续处理
let processingBlockChanged: boolean = false

// 确保 onChanged 监听器只注册一次的标志位
export let onBlockChangedOnce: boolean = false

/**
 * 注册 Logseq 数据库变更监听器
 * 当包含标题属性的块发生更新时，自动刷新侧边栏大纲
 * 使用 onBlockChangedOnce 标志位确保只注册一次，避免重复监听
 */
export const onBlockChanged = () => {

  if (onBlockChangedOnce === true)
    return
  onBlockChangedOnce = true
  logseq.DB.onChanged(async ({ blocks }) => {

    if (processingBlockChanged === true
      || currentPageOriginalName === ""
      || logseq.settings!.booleanLeftTOC === false)
      return
    // 在变更的块中查找含有 heading 属性的块（使用 find 而非 some 以获取 uuid）
    const findBlock = blocks.find((block) => block.properties?.heading) as { uuid: BlockEntity["uuid"] } | null
    if (!findBlock) return
    const uuid = findBlock ? findBlock!.uuid : null
    updateToc()

    setTimeout(() => {
      // 为该特定块注册单独的变更回调，实现精细化监听
      if (uuid)
        logseq.DB.onBlockChanged(uuid, () => updateToc())
    }, 200)

  })
}

/** 防抖更新 TOC：300ms 内只执行一次刷新 */
const updateToc = () => {
  if (processingBlockChanged === true)
    return
  processingBlockChanged = true
  setTimeout(() => {
    refreshPageHeaders(currentPageOriginalName)
    processingBlockChanged = false
  }, 300)
}



// 页面切换处理的防抖锁
let processingOnPageChanged: boolean = false

/**
 * 页面切换/加载时的核心回调函数
 * 负责刷新 TOC、更新工具栏图标状态、应用自动编号等
 * @param pageName - 目标页面名称
 * @param flag - 可选的缩放信息（是否处于缩放模式及对应块 UUID）
 */
export const onPageChangedCallback = async (pageName: string, flag?: { zoomIn: boolean, zoomInUuid: BlockEntity["uuid"] }) => {

  if (processingOnPageChanged === true)
    return
  processingOnPageChanged = true

  // 300ms 后自动释放防抖锁，防止异常情况下永久锁死
  setTimeout(() =>
    processingOnPageChanged = false, 300)

  setTimeout(async () => {
    // 1. 刷新侧边栏大纲列表
    if (logseq.settings?.[settingKeys.toc.master] === true)
      await refreshPageHeaders(pageName, flag ? flag : undefined)

    // 2. 更新工具栏编号授权图标状态（仅 Markdown 模式）
    if (logseqVersionMd === true) {
        const isEnabled = logseq.settings?.pageSwitch?.[pageName] === true
        if (isEnabled) {
            parent.document.documentElement.classList.add('lse-heading-enabled')
        } else {
            parent.document.documentElement.classList.remove('lse-heading-enabled')
        }
        updateToolbarIcon(pageName)
    }

    // 3. 若启用了文件更新模式编号，且当前页面已授权，则自动应用编号
    if (logseq.settings?.[settingKeys.toc.headingNumberFileEnable] === true) {
        const isEnabled = logseq.settings?.pageSwitch?.[pageName] === true
        if (isEnabled) {
            parent.document.documentElement.classList.add('lse-heading-enabled')
            await applyHeadingNumbersToPage(pageName)
        } else {
            parent.document.documentElement.classList.remove('lse-heading-enabled')
        }
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