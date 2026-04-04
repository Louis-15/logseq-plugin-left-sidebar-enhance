/**
 * 编号配置管理模块（图谱级隔离存储）
 *
 * 将以下两类数据存储在 Logseq 图谱内的一个专用配置页面中：
 * 1. 白名单（whitelist）：哪些页面启用了自动编号（存储页面 UUID，不受重命名影响）
 * 2. 块状态（blockStates）：各标题块的编号行为（skip/lock/repeat）
 *
 * 页面名称：lse-heading-numbering-config
 *
 * 好处：
 * 1. 数据天然按图谱隔离（每个图谱有自己的页面）
 * 2. 配置文件保存在图谱目录的 pages/ 下，可跟随微力同步等工具自动同步
 * 3. 不依赖 Node.js 文件系统权限，纯通过 Logseq Editor API 读写
 * 4. 白名单使用 UUID 标识页面，重命名笔记后编号配置不会丢失
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
 */

// 配置页面名称（在 Logseq 中作为普通页面存在）
const CONFIG_PAGE_NAME = 'lse-heading-numbering-config'

// ================ 内存缓存 ================

// 白名单缓存（存储页面 UUID）
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
                    // 加载白名单（仅保留 UUID 格式的条目，忽略旧版的 pageName 格式）
                    if (Array.isArray(data.whitelist)) {
                        data.whitelist.forEach((entry: string) => {
                            // UUID 格式通常包含连字符且长度 >= 32，pageName 则不会
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
                        data.whitelist.forEach((entry: string) => {
                            if (isUuidFormat(entry)) {
                                cachedWhitelist.add(entry)
                            }
                        })
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
 * UUID 包含连字符且长度 >= 32（如 "6f1a3c4b-..."）
 * pageName 通常是中文或英文标题，不包含连字符或长度远小于 32
 */
const isUuidFormat = (str: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// ================ 孤儿数据清理 ================

/**
 * 清理已不存在的页面和块的配置数据
 * 在插件启动 15 秒后延时调用，不阻塞 Logseq 启动
 * 逐个检查 UUID 是否仍然存在于图谱中，不存在则从缓存中移除
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
            // 查询失败视为不存在
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
