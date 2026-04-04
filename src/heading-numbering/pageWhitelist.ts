/**
 * 编号配置管理模块（图谱级隔离存储）
 *
 * 将以下两类数据存储在 Logseq 图谱内的一个专用配置页面中：
 * 1. 白名单（whitelist）：哪些页面启用了自动编号
 * 2. 块状态（blockStates）：各标题块的编号行为（skip/lock/repeat）
 *
 * 页面名称：lse-heading-numbering-config
 *
 * 好处：
 * 1. 数据天然按图谱隔离（每个图谱有自己的页面）
 * 2. 配置文件保存在图谱目录的 pages/ 下，可跟随微力同步等工具自动同步
 * 3. 不依赖 Node.js 文件系统权限，纯通过 Logseq Editor API 读写
 *
 * JSON 结构：
 * {
 *   "whitelist": ["页面A", "页面B"],
 *   "blockStates": {
 *     "block-uuid-1": "skip",
 *     "block-uuid-2": "lock",
 *     "block-uuid-3": "repeat"
 *   }
 * }
 */

// 配置页面名称（在 Logseq 中作为普通页面存在）
const CONFIG_PAGE_NAME = 'lse-heading-numbering-config'

// ================ 内存缓存 ================

// 白名单缓存
let cachedWhitelist: Set<string> = new Set()
// 块状态缓存：uuid → 状态字符串
let cachedBlockStates: Map<string, string> = new Map()
// 标记是否已从配置页面加载过
let isLoaded = false

// ================ 数据加载 ================

/**
 * 从图谱中的配置页面加载所有数据到内存缓存
 * 在插件启动和图谱切换时调用
 */
export const loadConfigFromPage = async (): Promise<void> => {
    cachedWhitelist.clear()
    cachedBlockStates.clear()
    isLoaded = false

    try {
        const page = await logseq.Editor.getPage(CONFIG_PAGE_NAME)
        if (!page) {
            // 配置页面尚未创建，所有数据为空
            isLoaded = true
            return
        }

        // 获取配置页面的所有块
        const blocks = await logseq.Editor.getPageBlocksTree(CONFIG_PAGE_NAME)
        if (!blocks || blocks.length === 0) {
            isLoaded = true
            return
        }

        // 在块中查找 JSON 数据（格式：```json {...} ```）
        for (const block of blocks) {
            const content = block.content || ''
            // 尝试从代码块中提取 JSON
            const jsonMatch = content.match(/```json\s*\n?([\s\S]*?)\n?```/)
            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[1].trim())
                    // 加载白名单
                    if (Array.isArray(data.whitelist)) {
                        data.whitelist.forEach((name: string) => cachedWhitelist.add(name))
                    }
                    // 加载块状态
                    if (data.blockStates && typeof data.blockStates === 'object') {
                        for (const [uuid, state] of Object.entries(data.blockStates)) {
                            if (typeof state === 'string' && state) {
                                cachedBlockStates.set(uuid, state)
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[LSE] 配置 JSON 解析失败:', e)
                }
                break // 只读取第一个匹配的 JSON 块
            }

            // 也尝试直接解析纯 JSON 内容（兼容简化格式）
            try {
                const data = JSON.parse(content.trim())
                if (data.whitelist || data.blockStates) {
                    if (Array.isArray(data.whitelist)) {
                        data.whitelist.forEach((name: string) => cachedWhitelist.add(name))
                    }
                    if (data.blockStates && typeof data.blockStates === 'object') {
                        for (const [uuid, state] of Object.entries(data.blockStates)) {
                            if (typeof state === 'string' && state) {
                                cachedBlockStates.set(uuid, state)
                            }
                        }
                    }
                    break
                }
            } catch {
                // 不是 JSON，跳过
            }
        }
    } catch (e) {
        console.error('[LSE] 加载编号配置失败:', e)
    }

    isLoaded = true
    console.log('[LSE] 编号配置已加载 — 白名单:', cachedWhitelist.size, '个页面, 块状态:', cachedBlockStates.size, '条记录')
}

// ================ 数据保存 ================

/**
 * 将内存缓存中的所有数据写回配置页面
 */
const saveConfig = async (): Promise<void> => {
    // 构建 blockStates 对象
    const blockStatesObj: Record<string, string> = {}
    for (const [uuid, state] of cachedBlockStates) {
        blockStatesObj[uuid] = state
    }

    const jsonData = JSON.stringify({
        whitelist: [...cachedWhitelist].sort(),
        blockStates: blockStatesObj
    }, null, 2)

    // 配置块的完整内容（使用代码块包裹 JSON，便于阅读和解析）
    const blockContent = '```json\n' + jsonData + '\n```'

    try {
        let page = await logseq.Editor.getPage(CONFIG_PAGE_NAME)

        if (!page) {
            // 首次创建配置页面
            page = await logseq.Editor.createPage(CONFIG_PAGE_NAME, {
                'exclude-from-graph-view': true
            }, {
                redirect: false,
                createFirstBlock: false
            })

            if (!page) {
                console.error('[LSE] 创建配置页面失败')
                return
            }
        }

        // 获取现有块
        const blocks = await logseq.Editor.getPageBlocksTree(CONFIG_PAGE_NAME)

        if (blocks && blocks.length > 0) {
            // 更新第一个块的内容
            await logseq.Editor.updateBlock(blocks[0].uuid, blockContent)
        } else {
            // 页面为空，插入新块
            await logseq.Editor.appendBlockInPage(CONFIG_PAGE_NAME, blockContent)
        }
    } catch (e) {
        console.error('[LSE] 保存编号配置失败:', e)
    }
}

// ================ 白名单操作 ================

/**
 * 判断指定页面是否在白名单中
 */
export const isPageWhitelisted = (pageName: string): boolean => {
    return cachedWhitelist.has(pageName)
}

/**
 * 将页面添加到白名单
 */
export const addPageToWhitelist = async (pageName: string): Promise<void> => {
    if (cachedWhitelist.has(pageName)) return
    cachedWhitelist.add(pageName)
    await saveConfig()
    console.log('[LSE] 已添加到白名单:', pageName)
}

/**
 * 将页面从白名单移除
 */
export const removePageFromWhitelist = async (pageName: string): Promise<void> => {
    if (!cachedWhitelist.has(pageName)) return
    cachedWhitelist.delete(pageName)
    await saveConfig()
    console.log('[LSE] 已从白名单移除:', pageName)
}

/**
 * 获取当前白名单的副本（用于调试）
 */
export const getWhitelist = (): string[] => {
    return [...cachedWhitelist]
}

// ================ 块状态操作 ================

/**
 * 获取块的编号状态（skip / lock / repeat / undefined）
 */
export const getBlockState = (blockUuid: string): string | undefined => {
    const val = cachedBlockStates.get(blockUuid)
    return val || undefined
}

/**
 * 设置块的编号状态
 * 传入 null 表示清除状态
 */
export const setBlockState = async (blockUuid: string, state: string | null): Promise<void> => {
    if (state === null || state === '') {
        cachedBlockStates.delete(blockUuid)
    } else {
        cachedBlockStates.set(blockUuid, state)
    }
    await saveConfig()
}

// ================ 工具函数 ================

/**
 * 检查配置是否已加载完成
 */
export const isConfigLoaded = (): boolean => {
    return isLoaded
}

// 保持向后兼容的别名
export const loadWhitelist = loadConfigFromPage
