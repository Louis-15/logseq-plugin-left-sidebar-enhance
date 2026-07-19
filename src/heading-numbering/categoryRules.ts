/**
 * 区间分类编号规则模块
 *
 * 功能：
 * 1. 从 SandboxStorage 加载/管理编号规则（键值对 + 索引 key）
 * 2. 解析笔记 YAML frontmatter 中的 tags，匹配对应的区间编号规则
 * 3. 按区间规则将 H1 标题分类（位置法 + 关键词匹配）
 *
 * 存储结构（SandboxStorage）：
 * - category-rule-index → ["人设标签", "人设组合"]（规则名列表）
 * - category-rule-人设标签 → { tag, categories: [...] }
 * - category-rule-人设组合 → { tag, categories: [...] }
 */

import { HierarchicalTocBlock } from '../page-outline/findHeaders'

// ==================== 类型定义 ====================

/** 单个区间的定义 */
export interface CategoryDef {
    id: number                    // 区间 ID（1-9），编号前缀 = id × 10
    name: string                  // 区间名称（用于调试和 UI 显示）
    keywords?: string[]           // 关键词列表（positionBased 为 true 时不需要）
    positionBased?: boolean       // 是否使用位置法分类（必须恰好一个区间为 true，且 id 为 1）
}

/** 一条完整的编号规则 */
export interface CategoryRule {
    tag: string                   // 关联的 tag 名（如 "人设标签"）
    categories: CategoryDef[]     // 区间定义数组，按 id 升序排列
}

// ==================== SandboxStorage Key 常量 ====================

/** 规则索引 key：存储所有规则名的 JSON 数组 */
const INDEX_KEY = 'category-rule-index'

/** 规则 key 前缀：category-rule-{规则名} */
const RULE_KEY_PREFIX = 'category-rule-'

// ==================== SandboxStorage 工具函数 ====================

/** 缓存的 SandboxStorage 实例 */
let _storage: any = null

/** 获取 SandboxStorage 实例（单例） */
const getStorage = () => {
    if (!_storage) {
        _storage = (logseq.Assets as any).makeSandboxStorage()
    }
    return _storage
}

/** 从 SandboxStorage 读取 JSON 数据 */
const storageGet = async <T>(key: string): Promise<T | null> => {
    try {
        const storage = getStorage()
        const raw = await storage.getItem(key)
        if (!raw) return null
        return JSON.parse(raw) as T
    } catch (e) {
        console.warn(`[categoryRules] 读取 ${key} 失败:`, e)
        return null
    }
}

/** 向 SandboxStorage 写入 JSON 数据 */
const storageSet = async (key: string, value: any): Promise<void> => {
    try {
        const storage = getStorage()
        await storage.setItem(key, JSON.stringify(value))
    } catch (e) {
        console.error(`[categoryRules] 写入 ${key} 失败:`, e)
    }
}

// ==================== 内存缓存 ====================

/**
 * tag 名 → CategoryRule 的映射表（内存缓存）
 * 在规则加载后构建，供后续快速查找
 */
let ruleCache: Map<string, CategoryRule> | null = null

// ==================== 默认规则 ====================

/**
 * 获取默认的「人设标签」规则
 * 插件首次启动时若没有任何规则，自动创建此规则
 */
const getDefaultRule = (): CategoryRule => ({
    tag: '人设标签',
    categories: [
        { id: 1, name: '特征类', positionBased: true },
        { id: 2, name: '搭配标签', keywords: ['反差', '分类及搭配标签', '通用搭配标签'] },
        { id: 3, name: '深度分析', keywords: ['适配度分析', '形成原因', '与其他标签的区别'] },
        { id: 4, name: '爱情线', keywords: ['爱情线'] },
        { id: 5, name: '人物弧光', keywords: ['人物弧光', '如何改变'] },
        { id: 6, name: '技巧', keywords: ['技巧'] },
        { id: 7, name: '举例', keywords: ['举例'] },
    ],
})

// ==================== 规则加载 ====================

/**
 * 确保默认规则存在
 * 如果 category-rule-index 不存在或为空，自动创建默认规则
 */
export const ensureDefaultRule = async (): Promise<void> => {
    const index = await storageGet<string[]>(INDEX_KEY)
    if (!index || index.length === 0) {
        console.log('[categoryRules] 未找到规则，自动创建默认规则「人设标签」')
        const defaultRule = getDefaultRule()
        await storageSet(RULE_KEY_PREFIX + defaultRule.tag, defaultRule)
        await storageSet(INDEX_KEY, [defaultRule.tag])
    }
}

/**
 * 从 SandboxStorage 加载所有规则
 * 根据「启用的规则」设置过滤
 * 返回 tag → CategoryRule 的映射表
 */
export const loadAllCategoryRules = async (): Promise<Map<string, CategoryRule>> => {
    const ruleMap = new Map<string, CategoryRule>()

    // 1. 读取索引
    const index = await storageGet<string[]>(INDEX_KEY)
    if (!index || index.length === 0) {
        ruleCache = ruleMap
        return ruleMap
    }

    // 2. 读取「启用的规则」设置
    const enabledRaw = logseq.settings?.headingCategoryRulesEnabled as string | undefined
    let enabledSet: Set<string> | null = null
    if (enabledRaw && enabledRaw.trim()) {
        // 按行分割，每行一个规则名，过滤空行和空白
        enabledSet = new Set(
            enabledRaw
                .split('\n')
                .map(s => s.trim())
                .filter(s => s.length > 0)
        )
    }

    // 3. 确定要加载的规则名列表
    const rulesToLoad = enabledSet
        ? index.filter(name => enabledSet!.has(name))  // 取交集
        : index  // 未配置则加载全部

    // 4. 逐个读取规则
    for (const ruleName of rulesToLoad) {
        const rule = await storageGet<CategoryRule>(RULE_KEY_PREFIX + ruleName)
        if (rule && rule.tag && rule.categories && rule.categories.length > 0) {
            ruleMap.set(rule.tag, rule)
        } else {
            console.warn(`[categoryRules] 规则 "${ruleName}" 数据无效，跳过`)
        }
    }

    ruleCache = ruleMap
    console.log(`[categoryRules] 已加载 ${ruleMap.size} 条规则:`, [...ruleMap.keys()])
    return ruleMap
}

/**
 * 获取当前缓存的规则映射表
 * 如果没有加载过，自动加载；如果加载失败或无数据，使用内存默认规则兜底
 */
const getRuleMap = async (): Promise<Map<string, CategoryRule>> => {
    if (ruleCache === null) {
        try {
            await ensureDefaultRule()
            ruleCache = await loadAllCategoryRules()
        } catch (e) {
            console.warn('[categoryRules] 从存储加载规则失败，使用内存默认规则:', e)
        }
        // 兜底：如果加载后仍然为空，直接在内存中提供默认规则
        if (!ruleCache || ruleCache.size === 0) {
            console.log('[categoryRules] 内存中无规则，注入默认「人设标签」规则')
            ruleCache = new Map()
            ruleCache.set('人设标签', getDefaultRule())
        }
    }
    return ruleCache
}

/**
 * 清除规则缓存（设置变更时调用，强制下次重新加载）
 */
export const clearRuleCache = (): void => {
    ruleCache = null
}

// ==================== YAML Frontmatter 解析 ====================

/**
 * 将 Logseq 内部 tag 引用对象解析为 tag 名称
 * Logseq 返回的 tags 格式: {"id": 6526} 或 "#人设标签"
 * 
 * @param tagItem 可能是 {id: number} 对象或字符串
 * @returns tag 名称（不含 # 前缀），如 "人设标签"
 */
const resolveTagToName = async (tagItem: any): Promise<string | null> => {
    // 情况 1：已经是纯字符串
    if (typeof tagItem === 'string') {
        return tagItem.replace(/^#/, '').trim()
    }

    // 情况 2：是 {id: number} 引用对象，需要通过 getPage 解析
    if (tagItem && typeof tagItem === 'object' && tagItem.id) {
        try {
            const resolvedPage = await logseq.Editor.getPage(tagItem.id) as any
            if (resolvedPage && resolvedPage.originalName) {
                return resolvedPage.originalName
            }
            if (resolvedPage && resolvedPage.name) {
                return resolvedPage.name
            }
        } catch (e) {
            console.warn(`[categoryRules] 解析 tag id=${tagItem.id} 失败:`, e)
        }
    }

    return null
}

/**
 * 从页面属性中提取 tags
 * 
 * Logseq 的 YAML frontmatter 中的 tags: 会被解析为页面级属性。
 * logseq.Editor.getPage() 需要传入页面 UUID（不是页面名）。
 * 我们通过 getPageBlocksTree 获取第一个块的 page.id 来得到页面 UUID。
 * 
 * @param pageName 页面名称
 * @returns tag 名数组（不含 # 前缀），如 ["人设标签", "人设模型"]
 */
const extractTagsFromPage = async (pageName: string): Promise<string[]> => {
    try {
        // 先获取块树，拿到页面的 UUID
        const blocks = await logseq.Editor.getPageBlocksTree(pageName) as any[]
        if (!blocks || blocks.length === 0) {
            console.warn(`[categoryRules] 页面 "${pageName}" 没有块`)
            return []
        }

        // 从第一个块的 page 属性中获取页面 UUID
        const pageUuid = blocks[0]?.page?.id
        if (!pageUuid) {
            console.warn(`[categoryRules] 无法获取页面 "${pageName}" 的 UUID`)
            return []
        }

        // 用 UUID 获取完整页面对象
        const page = await logseq.Editor.getPage(pageUuid) as any
        console.log(`[categoryRules] 页面对象 keys:`, page ? Object.keys(page) : 'null')

        if (!page) return []

        // 尝试多种方式获取 tags
        // 方式 1: page.tags（可能是数组或字符串）
        if (page.tags) {
            console.log(`[categoryRules] 找到 page.tags，值:`, JSON.stringify(page.tags), `类型: ${typeof page.tags}, 是数组: ${Array.isArray(page.tags)}`)
            if (Array.isArray(page.tags)) {
                // Logseq 的 tags 是引用对象数组 [{id: 6526}, {id: 73362}]，需要解析为 tag 名
                const result: string[] = []
                for (let i = 0; i < page.tags.length; i++) {
                    const item = page.tags[i]
                    const tagName = await resolveTagToName(item)
                    console.log(`[categoryRules]   tag[${i}]: 原始=${JSON.stringify(item)}, 解析为="${tagName}"`)
                    if (tagName) result.push(tagName)
                }
                console.log(`[categoryRules] 最终提取的 tags:`, JSON.stringify(result))
                return result
            }
            if (typeof page.tags === 'string') {
                return page.tags.split(/[\s,]+/).map((t: string) => t.replace(/^#/, '').trim()).filter(Boolean)
            }
        }

        // 方式 2: page.properties?.tags
        const props = page.properties
        if (props) {
            if (props.tags) {
                const tagVal = props.tags
                if (Array.isArray(tagVal)) {
                    return tagVal.map((t: any) => String(t).replace(/^#/, '').trim()).filter(Boolean)
                }
                if (typeof tagVal === 'string') {
                    return tagVal.split(/[\s,]+/).map((t: string) => t.replace(/^#/, '').trim()).filter(Boolean)
                }
            }
        }

        // 方式 3: 遍历 page 对象的所有 key 找 tags
        for (const [key, value] of Object.entries(page)) {
            if (key.toLowerCase().includes('tag') && value) {
                console.log(`[categoryRules] 找到 ${key}:`, value)
                const v = value as any
                if (Array.isArray(v)) {
                    return v.map((t: any) => String(t).replace(/^#/, '').trim()).filter(Boolean)
                }
                if (typeof v === 'string') {
                    return v.split(/[\s,]+/).map((t: string) => t.replace(/^#/, '').trim()).filter(Boolean)
                }
            }
        }
    } catch (e) {
        console.warn('[categoryRules] 获取页面 tags 失败:', e)
    }
    return []
}

// ==================== 规则匹配 ====================

/**
 * 检测页面应使用的区间编号规则
 * 
 * @param pageName 页面名称
 * @returns 匹配到的 CategoryRule，或 null（无匹配 → 回退到顺序编号）
 */
export const detectPageCategoryRule = async (pageName: string): Promise<CategoryRule | null> => {
    // 1. 从页面属性提取 tags
    const tags = await extractTagsFromPage(pageName)
    console.log(`[categoryRules] 页面 "${pageName}" 的 tags:`, JSON.stringify(tags))
    if (tags.length === 0) return null

    // 2. 加载规则映射表
    const ruleMap = await getRuleMap()
    console.log(`[categoryRules] 规则映射表 keys:`, JSON.stringify([...ruleMap.keys()]))

    // 3. 按顺序匹配，第一个命中即生效
    for (const tag of tags) {
        console.log(`[categoryRules] 尝试匹配 tag "${tag}" (类型: ${typeof tag})`)
        const rule = ruleMap.get(tag)
        if (rule) {
            console.log(`[categoryRules] ✅ 页面 tag "${tag}" 匹配规则，共 ${rule.categories.length} 个区间`)
            return rule
        } else {
            console.log(`[categoryRules] ❌ tag "${tag}" 未匹配任何规则`)
        }
    }

    console.log(`[categoryRules] 所有 tags 均未匹配，回退到顺序编号`)
    return null
}

// ==================== 标题分类 ====================

/**
 * 按区间规则对 H1 标题进行分类
 * 
 * 算法：
 * 1. 扫描所有 H1，找到第一个匹配区间 2+ 关键词的标题 → 锚点
 * 2. 锚点之前的所有 H1 → 归入区间 1（positionBased）
 * 3. 锚点及之后 → 按关键词匹配分派到区间 2~N
 * 4. 无匹配 → 沿用上一个匹配成功的区间（保持连续性）
 * 
 * @param headers 所有标题块（已按文档顺序排序的树形结构）
 * @param rule 区间编号规则
 * @returns Map<区间ID, H1标题数组>，标题保持原始文档顺序
 */
export const classifyHeadingsByCategory = (
    headers: HierarchicalTocBlock[],
    rule: CategoryRule
): Map<number, HierarchicalTocBlock[]> => {
    const result = new Map<number, HierarchicalTocBlock[]>()

    // 初始化所有区间的空数组
    for (const cat of rule.categories) {
        result.set(cat.id, [])
    }

    if (headers.length === 0) return result

    // 找到第一个匹配区间 2+ 关键词的 H1 索引（锚点）
    let anchorIndex = -1

    for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        // 只处理 H1 标题（level === 1）
        if (header.level !== 1) continue

        const titleText = extractTitleText(header.content || '')

        // 在区间 2~N 中搜索关键词匹配
        for (const cat of rule.categories) {
            if (cat.positionBased || cat.id === 1) continue  // 跳过位置法区间
            if (!cat.keywords || cat.keywords.length === 0) continue

            if (matchKeywords(titleText, cat.keywords)) {
                anchorIndex = i
                break
            }
        }

        if (anchorIndex >= 0) break
    }

    // 如果没有任何标题匹配区间 2+ 的关键词，所有标题都归入区间 1
    if (anchorIndex < 0) {
        const positionBasedCat = rule.categories.find(c => c.positionBased)
        const targetId = positionBasedCat ? positionBasedCat.id : 1
        for (const header of headers) {
            if (header.level === 1) {
                result.get(targetId)!.push(header)
            }
        }
        return result
    }

    // 获取位置法区间的 ID
    const positionBasedCat = rule.categories.find(c => c.positionBased)
    const positionBasedId = positionBasedCat ? positionBasedCat.id : 1

    // 记录上一个匹配到的区间 ID（用于无匹配标题的兜底）
    let lastMatchedId = positionBasedId

    // 遍历所有 H1 标题
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        if (header.level !== 1) continue

        const titleText = extractTitleText(header.content || '')

        if (i < anchorIndex) {
            // 锚点之前 → 归入区间 1
            result.get(positionBasedId)!.push(header)
            lastMatchedId = positionBasedId
        } else {
            // 锚点及之后 → 按关键词匹配
            let matched = false

            for (const cat of rule.categories) {
                if (cat.positionBased || cat.id === 1) continue
                if (!cat.keywords || cat.keywords.length === 0) continue

                if (matchKeywords(titleText, cat.keywords)) {
                    result.get(cat.id)!.push(header)
                    lastMatchedId = cat.id
                    matched = true
                    break
                }
            }

            if (!matched) {
                // 无匹配 → 沿用上一个匹配成功的区间
                result.get(lastMatchedId)!.push(header)
            }
        }
    }

    // 打印分类结果（调试用）
    if (typeof logseq !== 'undefined') {
        const summary: string[] = []
        for (const [id, hdrs] of result) {
            if (hdrs.length > 0) {
                summary.push(`区间${id}: ${hdrs.length}个标题`)
            }
        }
        console.log(`[categoryRules] 分类结果: ${summary.join(', ')}`)
    }

    return result
}

// ==================== 工具函数 ====================

/**
 * 从标题行提取纯文本（去除 # 标记和已有编号）
 * 例如 "# 21 反差" → "反差"
 * 例如 "## 21.1 偶尔的小聪明" → "偶尔的小聪明"
 */
const extractTitleText = (content: string): string => {
    // 去除首行的 # 前缀
    let text = content.replace(/^#{1,6}\s+/, '')
    // 去除可能的编号（如 "21 " 或 "21.1 "）
    text = text.replace(/^\d+(?:[.\-]\d+)*\s+/, '')
    return text.trim()
}

/**
 * 检查标题文本是否匹配任一关键词（子串包含匹配）
 * 忽略大小写和全角/半角空格差异
 */
const matchKeywords = (titleText: string, keywords: string[]): boolean => {
    // 标准化文本：全角空格 → 半角空格
    const normalized = titleText.replace(/\u3000/g, ' ').toLowerCase()
    for (const kw of keywords) {
        const normalizedKw = kw.replace(/\u3000/g, ' ').toLowerCase()
        if (normalized.includes(normalizedKw)) return true
    }
    return false
}
