/**
 * 编号配置管理模块（图谱级隔离存储）
 *
 * 使用 Logseq 官方的 SandboxStorage API 将配置数据存储为 JSON 文件：
 * 1. 白名单（whitelist）：哪些页面启用了自动编号（存储页面 UUID，不受重命名影响）
 * 2. 块状态（blockStates）：各标题块的编号行为（skip/lock/repeat）
 *
 * 存储位置：{.logseq/plugins/插件目录/storage/}{图谱名}.json
 *
 * 好处：
 * 1. 使用图谱名作为文件名，天然按图谱隔离
 * 2. 不会被 Logseq 当作笔记页面索引（在 Logseq 里看不见）
 * 3. 白名单使用 UUID 标识页面，重命名笔记后编号配置不会丢失
 * 4. 使用 Logseq 官方 API，稳定可靠
 *
 * JSON 结构：
 * {
 *   "whitelist": ["page-uuid-1", "page-uuid-2"],
 *   "blockStates": {
 *     "block-uuid-1": "skip",
 *     "block-uuid-2": "lock",
 *     "block-uuid-3": "repeat"
 *   }
 * }
 *
 * 升级迁移：
 * 首次使用新版时，会自动从旧版的 md 配置页面迁移数据。
 */

// 旧版配置页面名称（用于迁移）
const LEGACY_CONFIG_PAGE_NAME = 'lse-heading-numbering-config'

// ================ 沙箱存储 ================

// 缓存的存储实例
let _storage: any = null
// 缓存的当前图谱存储 key
let _currentGraphKey: string = ''

/**
 * 获取沙箱存储实例（单例）
 */
const getStorage = () => {
    if (!_storage) {
        _storage = logseq.Assets.makeSandboxStorage()
    }
    return _storage
}

/**
 * 获取当前图谱对应的存储 key
 * 格式：{图谱名}.json（如 "AI与编程.json"）
 */
const getGraphKey = async (): Promise<string> => {
    if (_currentGraphKey) return _currentGraphKey
    try {
        const graph = await logseq.App.getCurrentGraph()
        const graphName = graph?.name || 'default'
        _currentGraphKey = `${graphName}.json`
    } catch {
        _currentGraphKey = 'default.json'
    }
    return _currentGraphKey
}

// ================ 内存缓存 ================

// 白名单缓存（存储页面 UUID）
let cachedWhitelist: Set<string> = new Set()
// 块状态缓存：uuid → 状态字符串
let cachedBlockStates: Map<string, string> = new Map()
// 标记是否已加载过
let isLoaded = false

// ================ JSON 数据解析 ================

/**
 * 从 JSON 数据对象中提取白名单和块状态到内存缓存
 */
const parseConfigData = (data: any): void => {
    // 加载白名单（仅保留 UUID 格式的条目，忽略旧版的 pageName 格式）
    if (Array.isArray(data.whitelist)) {
        data.whitelist.forEach((entry: string) => {
            if (isUuidFormat(entry)) {
                cachedWhitelist.add(entry)
            }
        })
    }
    // 加载块状态
    if (data.blockStates && typeof data.blockStates === 'object') {
        for (const [uuid, state] of Object.entries(data.blockStates)) {
            if (typeof state === 'string' && state) {
                cachedBlockStates.set(uuid, state)
            }
        }
    }
}

/**
 * 将内存缓存序列化为 JSON 对象
 */
const buildConfigData = (): object => {
    const blockStatesObj: Record<string, string> = {}
    for (const [uuid, state] of cachedBlockStates) {
        blockStatesObj[uuid] = state
    }
    return {
        whitelist: [...cachedWhitelist].sort(),
        blockStates: blockStatesObj
    }
}

// ================ 数据加载 ================

/**
 * 从沙箱存储（或旧版 md 页面）加载所有数据到内存缓存
 * 在插件启动和图谱切换时调用
 */
export const loadConfigFromPage = async (): Promise<void> => {
    cachedWhitelist.clear()
    cachedBlockStates.clear()
    isLoaded = false
    // 图谱切换时重置 key 缓存
    _currentGraphKey = ''

    try {
        const storage = getStorage()
        const key = await getGraphKey()

        // 尝试从沙箱存储读取
        const raw = await storage.getItem(key)
        if (raw) {
            const data = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw))
            parseConfigData(data)
            isLoaded = true
            console.log('[LSE] 编号配置已加载 — 白名单:', cachedWhitelist.size, '个页面, 块状态:', cachedBlockStates.size, '条记录')
            return
        }

        // 沙箱存储为空，尝试从旧版 md 页面迁移
        const migrated = await migrateFromLegacyPage()
        if (migrated) {
            isLoaded = true
            console.log('[LSE] 已从旧版 md 页面迁移到沙箱存储 — 白名单:', cachedWhitelist.size, '个页面, 块状态:', cachedBlockStates.size, '条记录')
            return
        }

        // 首次使用，数据为空
        isLoaded = true
        console.log('[LSE] 编号配置为空（首次使用）')
    } catch (e) {
        console.error('[LSE] 加载编号配置失败:', e)
        isLoaded = true
    }
}

// ================ 数据保存 ================

/**
 * 将内存缓存中的所有数据写回沙箱存储
 */
const saveConfig = async (): Promise<void> => {
    try {
        const storage = getStorage()
        const key = await getGraphKey()
        const data = buildConfigData()
        await storage.setItem(key, JSON.stringify(data, null, 2))
    } catch (e) {
        console.error('[LSE] 保存编号配置失败:', e)
    }
}

// ================ 旧版迁移 ================

/**
 * 从旧版 Logseq md 配置页面迁移数据到沙箱存储
 * 返回 true 表示迁移成功（有数据被迁移）
 */
const migrateFromLegacyPage = async (): Promise<boolean> => {
    try {
        const page = await logseq.Editor.getPage(LEGACY_CONFIG_PAGE_NAME)
        if (!page) return false // 旧页面不存在，无需迁移

        const blocks = await logseq.Editor.getPageBlocksTree(LEGACY_CONFIG_PAGE_NAME)
        if (!blocks || blocks.length === 0) return false

        // 从旧页面提取 JSON 数据
        for (const block of blocks) {
            const content = block.content || ''
            // 尝试从代码块中提取 JSON
            const jsonMatch = content.match(/```json\s*\n?([\s\S]*?)\n?```/)
            if (jsonMatch) {
                try {
                    parseConfigData(JSON.parse(jsonMatch[1].trim()))
                } catch (e) {
                    console.warn('[LSE] 旧版配置 JSON 解析失败:', e)
                }
                break
            }
            // 也尝试直接解析纯 JSON 内容
            try {
                const data = JSON.parse(content.trim())
                if (data.whitelist || data.blockStates) {
                    parseConfigData(data)
                    break
                }
            } catch {
                // 不是 JSON，跳过
            }
        }

        // 如果有数据被加载，保存到沙箱存储
        if (cachedWhitelist.size > 0 || cachedBlockStates.size > 0) {
            await saveConfig()
            return true
        }
    } catch (e) {
        console.warn('[LSE] 旧版数据迁移失败:', e)
    }
    return false
}

// ================ 白名单操作 ================

/**
 * 判断指定页面是否在白名单中（通过页面 UUID 比对）
 */
export const isPageWhitelisted = (pageUuid: string): boolean => {
    return cachedWhitelist.has(pageUuid)
}

/**
 * 将页面添加到白名单（使用页面 UUID）
 */
export const addPageToWhitelist = async (pageUuid: string): Promise<void> => {
    if (cachedWhitelist.has(pageUuid)) return
    cachedWhitelist.add(pageUuid)
    await saveConfig()
    console.log('[LSE] 已添加到白名单 (UUID):', pageUuid)
}

/**
 * 将页面从白名单移除（使用页面 UUID）
 */
export const removePageFromWhitelist = async (pageUuid: string): Promise<void> => {
    if (!cachedWhitelist.has(pageUuid)) return
    cachedWhitelist.delete(pageUuid)
    await saveConfig()
    console.log('[LSE] 已从白名单移除 (UUID):', pageUuid)
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

/**
 * 判断字符串是否为 UUID 格式
 */
const isUuidFormat = (str: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// ================ 孤儿数据清理 ================

/**
 * 清理已不存在的页面和块的配置数据
 * 在插件启动 15 秒后延时调用，不阻塞 Logseq 启动
 */
export const cleanUpOrphanedData = async (): Promise<void> => {
    let removedPages = 0
    let removedBlocks = 0

    // 1. 清理白名单中已删除的页面
    const pageUuids = [...cachedWhitelist]
    for (const uuid of pageUuids) {
        try {
            const page = await logseq.Editor.getPage(uuid)
            if (!page) {
                cachedWhitelist.delete(uuid)
                removedPages++
            }
        } catch {
            cachedWhitelist.delete(uuid)
            removedPages++
        }
    }

    // 2. 清理 blockStates 中已删除的块
    const blockUuids = [...cachedBlockStates.keys()]
    for (const uuid of blockUuids) {
        try {
            const block = await logseq.Editor.getBlock(uuid)
            if (!block) {
                cachedBlockStates.delete(uuid)
                removedBlocks++
            }
        } catch {
            cachedBlockStates.delete(uuid)
            removedBlocks++
        }
    }

    // 3. 如果有清理则保存
    if (removedPages > 0 || removedBlocks > 0) {
        await saveConfig()
        console.log(`[LSE] 孤儿数据清理完成 — 移除了 ${removedPages} 个失效页面白名单, ${removedBlocks} 个失效块状态`)
    } else {
        console.log('[LSE] 孤儿数据清理完成 — 无需清理')
    }
}

// 保持向后兼容的别名
export const loadWhitelist = loadConfigFromPage
