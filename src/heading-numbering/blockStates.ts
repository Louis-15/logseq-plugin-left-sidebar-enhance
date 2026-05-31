/**
 * 块编号状态持久化存储模块（图谱级隔离存储）
 *
 * 使用 Logseq 官方的 SandboxStorage API 将块状态存储为 JSON 文件：
 * 块状态（blockStates）：各标题块的编号行为（skip/lock/repeat）
 *
 * 存储位置：{图谱目录/assets/storages/left-sidebar-enhance/}{图谱名}.json
 *
 * 好处：
 * 1. 使用图谱名作为文件名，天然按图谱隔离
 * 2. 不会被 Logseq 当作笔记页面索引（在 Logseq 里看不见）
 * 3. 使用 Logseq 官方 API，稳定可靠
 *
 * JSON 结构：
 * {
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

// 块状态缓存：uuid → 状态字符串
let cachedBlockStates: Map<string, string> = new Map()
// 标记是否已加载过
let isLoaded = false

// ================ JSON 数据解析 ================

/**
 * 从 JSON 数据对象中提取块状态到内存缓存
 */
const parseConfigData = (data: any): void => {
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
        blockStates: blockStatesObj
    }
}

// ================ 数据加载 ================

/**
 * 从沙箱存储（或旧版 md 页面）加载所有数据到内存缓存
 * 在插件启动和图谱切换时调用
 *
 * ⚠️ 安全设计：加载前备份现有缓存，加载失败时自动恢复
 * 防止 saveConfig() 因缓存意外为空而覆盖已有文件
 */
export const loadConfigFromPage = async (): Promise<void> => {
    // 备份当前缓存，以便加载失败时恢复
    const backupStates = new Map(cachedBlockStates)

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

            // 🧹 升级迁移：清除旧版残留的 whitelist 字段（新版纯按钮触发，不再使用白名单）
            if (data.whitelist !== undefined) {
                delete data.whitelist
                await storage.setItem(key, JSON.stringify(buildConfigData(), null, 2))
                console.log('[LSE] 已清除旧版残留白名单数据')
            }

            isLoaded = true
            console.log('[LSE] 块状态已加载 —', cachedBlockStates.size, '条记录')
            return
        }

        // 沙箱存储为空，尝试从旧版 md 页面迁移
        const migrated = await migrateFromLegacyPage()
        if (migrated) {
            isLoaded = true
            console.log('[LSE] 已从旧版 md 页面迁移到沙箱存储 —', cachedBlockStates.size, '条块状态记录')
            return
        }

        // 首次使用，数据为空
        isLoaded = true
        console.log('[LSE] 块状态配置为空（首次使用）')
    } catch (e) {
        console.error('[LSE] 加载块状态配置失败，恢复上次缓存:', e)
        // 恢复备份，避免后续 saveConfig 用空数据覆盖已有文件
        cachedBlockStates = new Map(backupStates)
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
        if (cachedBlockStates.size > 0) {
            await saveConfig()
            return true
        }
    } catch (e) {
        console.warn('[LSE] 旧版数据迁移失败:', e)
    }
    return false
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
 * 清理已不存在的块的配置数据
 * 在插件启动 15 秒后延时调用，不阻塞 Logseq 启动
 *
 * ⚠️ 安全说明：当 getBlock() 抛出异常时，保留该块状态
 * 避免因 Logseq 启动未完成/图谱同步中/临时 API 故障等
 * 系统性原因导致全部数据被误删
 */
export const cleanUpOrphanedData = async (): Promise<void> => {
    let removedBlocks = 0
    let errorCount = 0

    // 清理 blockStates 中已删除的块
    const blockUuids = [...cachedBlockStates.keys()]
    for (const uuid of blockUuids) {
        try {
            const block = await logseq.Editor.getBlock(uuid)
            if (!block) {
                // getBlock 返回 null → 块确实不存在 → 安全删除
                cachedBlockStates.delete(uuid)
                removedBlocks++
            }
        } catch (e) {
            // 【关键】getBlock 抛出异常不能视为"块已删除"
            // 可能是：Logseq 尚未就绪、图谱同步中、临时 API 故障
            // 此时删除会导致有效数据永久丢失
            errorCount++
            console.warn(`[LSE] 检查块 ${uuid} 时出错，保留其状态:`, e)
        }
    }

    if (removedBlocks > 0) {
        await saveConfig()
        console.log(`[LSE] 孤儿数据清理完成 — 移除了 ${removedBlocks} 个失效块状态` +
            (errorCount > 0 ? `，${errorCount} 个块因错误已跳过保留` : ''))
    } else if (errorCount > 0) {
        // 有错误但无删除：可能是系统性问题，不清除任何数据
        console.log(`[LSE] 孤儿数据清理跳过 — ${errorCount} 个块检查出错，保留全部现有状态`)
    } else {
        console.log('[LSE] 孤儿数据清理完成 — 无需清理')
    }
}

// 保持向后兼容的别名（旧名称，仅用于外部可能的动态引用）
export const loadWhitelist = loadConfigFromPage
