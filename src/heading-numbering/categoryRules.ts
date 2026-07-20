/**
 * 区间分类编号规则模块
 *
 * 功能：
 * 1. 从插件目录下的 category-rules/*.json 文件加载编号规则
 * 2. 解析笔记 YAML frontmatter 中的 tags，匹配对应的区间编号规则
 * 3. 按区间规则将 H1 标题分类（位置法 + 关键词匹配）
 *
 * 规则文件存储：{插件根目录}/category-rules/{规则名}.json
 * 例如：c:\Users\aaa\.logseq\plugins\left-sidebar-enhance\category-rules\人设标签.json
 *
 * 用户在 VS Code 中直接编辑这些 JSON 文件，插件启动时通过 fetch() 重新读取。
 * 首次使用若无此目录/文件，插件使用内存中的默认规则。
 */

import { HierarchicalTocBlock } from '../page-outline/findHeaders'

// ==================== 类型定义 ====================

/** 子标题固定编号规则（用于 H2/H3 级别的固定序号） */
export interface SubHeadingRule {
    number: number              // 固定序号（如 1, 2, 3...）
    keywords: string[]          // 关键词列表（子串包含匹配）
    subHeadings?: SubHeadingRule[]  // 嵌套子标题规则（用于更深层级）
}

/** 单个区间的定义 */
export interface CategoryDef {
    id: number                    // 区间 ID（1-9），编号前缀 = id × 10
    name: string                  // 区间名称（用于调试和 UI 显示）
    keywords?: string[]           // 关键词列表（positionBased 为 true 时不需要）
    positionBased?: boolean       // 是否使用位置法分类（必须恰好一个区间为 true，且 id 为 1）
    subHeadings?: SubHeadingRule[]  // 子标题固定编号规则（可选）
}

/** 一条完整的编号规则 */
export interface CategoryRule {
    tag: string                   // 关联的 tag 名（如 "人设标签"）
    categories: CategoryDef[]     // 区间定义数组，按 id 升序排列
}

// ==================== 本地 JSON 文件路径 ====================

/**
 * 规则文件相对于 dist/index.html 的路径前缀
 * dist/index.html 在 {plugin}/dist/ 下，规则文件在 {plugin}/category-rules/ 下
 */
const RULES_DIR = '../category-rules/'

// ==================== 内存缓存 ====================

/**
 * tag 名 → CategoryRule 的映射表（内存缓存）
 * 在规则加载后构建，供后续快速查找
 */
let ruleCache: Map<string, CategoryRule> | null = null

// ==================== 默认规则 ====================

/**
 * 获取默认的「人设标签」规则
 * 当本地 JSON 文件不存在时，使用此内存默认规则
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

// ==================== 规则加载（本地 JSON 文件） ====================

/**
 * 从插件目录的 category-rules/ 文件夹加载单个 JSON 规则文件
 * 使用 fetch() 读取相对于 dist/index.html 的路径
 */
const loadRuleFromFile = async (ruleName: string): Promise<CategoryRule | null> => {
    const url = RULES_DIR + encodeURIComponent(ruleName) + '.json'
    try {
        const response = await fetch(url, { cache: 'no-cache' })
        if (!response.ok) {
            console.warn(`[categoryRules] 加载规则文件失败 (${response.status}): ${url}`)
            return null
        }
        const data = await response.json() as CategoryRule
        if (!data.tag || !data.categories || !Array.isArray(data.categories)) {
            console.warn(`[categoryRules] 规则文件 "${ruleName}" 格式无效`)
            return null
        }
        return data
    } catch (e) {
        console.warn(`[categoryRules] 读取规则文件异常 "${ruleName}":`, e)
        return null
    }
}

/**
 * 从本地 JSON 文件加载所有规则
 * 根据「启用的规则」设置过滤
 */
export const loadAllCategoryRules = async (): Promise<Map<string, CategoryRule>> => {
    const ruleMap = new Map<string, CategoryRule>()

    const enabledRaw = logseq.settings?.headingCategoryRulesEnabled as string | undefined
    let rulesToLoad: string[]

    if (enabledRaw && enabledRaw.trim()) {
        rulesToLoad = enabledRaw
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0)
    } else {
        rulesToLoad = ['人设标签']
    }

    for (const ruleName of rulesToLoad) {
        const rule = await loadRuleFromFile(ruleName)
        if (rule) {
            ruleMap.set(rule.tag, rule)
            console.log(`[categoryRules] ✅ 已加载规则: ${rule.tag} (${rule.categories.length} 个区间)`)
        }
    }

    ruleCache = ruleMap
    console.log(`[categoryRules] 共加载 ${ruleMap.size} 条规则:`, [...ruleMap.keys()])
    return ruleMap
}

/**
 * 获取当前缓存的规则映射表
 * 如果没有加载过，自动加载；失败则使用内存默认规则兜底
 */
const getRuleMap = async (): Promise<Map<string, CategoryRule>> => {
    if (ruleCache === null) {
        try {
            ruleCache = await loadAllCategoryRules()
        } catch (e) {
            console.warn('[categoryRules] 加载规则失败，使用内存默认规则:', e)
        }
        if (!ruleCache || ruleCache.size === 0) {
            console.log('[categoryRules] 未有本地规则文件，使用内存默认「人设标签」规则')
            ruleCache = new Map()
            ruleCache.set('人设标签', getDefaultRule())
        }
    }
    return ruleCache
}

/** 清除规则缓存（设置变更时调用） */
export const clearRuleCache = (): void => {
    ruleCache = null
}

/** 确保默认规则存在（兼容旧接口） */
export const ensureDefaultRule = async (): Promise<void> => {
    await getRuleMap()
}

// ==================== Tag 解析 ====================

/** 将 Logseq 内部 tag 引用对象解析为 tag 名称 */
const resolveTagToName = async (tagItem: any): Promise<string | null> => {
    if (typeof tagItem === 'string') {
        return tagItem.replace(/^#/, '').trim()
    }
    if (tagItem && typeof tagItem === 'object' && tagItem.id) {
        try {
            const resolvedPage = await logseq.Editor.getPage(tagItem.id) as any
            if (resolvedPage && resolvedPage.originalName) return resolvedPage.originalName
            if (resolvedPage && resolvedPage.name) return resolvedPage.name
        } catch (e) {
            console.warn(`[categoryRules] 解析 tag id=${tagItem.id} 失败:`, e)
        }
    }
    return null
}

/** 从页面属性中提取 tags */
const extractTagsFromPage = async (pageName: string): Promise<string[]> => {
    try {
        const blocks = await logseq.Editor.getPageBlocksTree(pageName) as any[]
        if (!blocks || blocks.length === 0) return []

        const pageUuid = blocks[0]?.page?.id
        if (!pageUuid) return []

        const page = await logseq.Editor.getPage(pageUuid) as any
        if (!page) return []

        if (page.tags && Array.isArray(page.tags)) {
            const result: string[] = []
            for (const item of page.tags) {
                const tagName = await resolveTagToName(item)
                if (tagName) result.push(tagName)
            }
            return result
        }

        if (page.tags && typeof page.tags === 'string') {
            return page.tags.split(/[\s,]+/).map((t: string) => t.replace(/^#/, '').trim()).filter(Boolean)
        }
    } catch (e) {
        console.warn('[categoryRules] 获取页面 tags 失败:', e)
    }
    return []
}

// ==================== 规则匹配 ====================

/** 检测页面应使用的区间编号规则 */
export const detectPageCategoryRule = async (pageName: string): Promise<CategoryRule | null> => {
    const tags = await extractTagsFromPage(pageName)
    if (tags.length === 0) return null

    const ruleMap = await getRuleMap()

    for (const tag of tags) {
        const rule = ruleMap.get(tag)
        if (rule) {
            console.log(`[categoryRules] ✅ tag "${tag}" 匹配规则，${rule.categories.length} 个区间`)
            return rule
        }
    }

    console.log(`[categoryRules] tags ${JSON.stringify(tags)} 未匹配，回退顺序编号`)
    return null
}

// ==================== 标题分类 ====================

/** 按区间规则对 H1 标题进行分类 */
export const classifyHeadingsByCategory = (
    headers: HierarchicalTocBlock[],
    rule: CategoryRule
): Map<number, HierarchicalTocBlock[]> => {
    const result = new Map<number, HierarchicalTocBlock[]>()

    for (const cat of rule.categories) {
        result.set(cat.id, [])
    }

    if (headers.length === 0) return result

    let anchorIndex = -1

    for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        if (header.level !== 1) continue

        const titleText = extractTitleText(header.content || '')

        for (const cat of rule.categories) {
            if (cat.positionBased || cat.id === 1) continue
            if (!cat.keywords || cat.keywords.length === 0) continue

            if (matchKeywords(titleText, cat.keywords)) {
                anchorIndex = i
                break
            }
        }

        if (anchorIndex >= 0) break
    }

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

    const positionBasedCat = rule.categories.find(c => c.positionBased)
    const positionBasedId = positionBasedCat ? positionBasedCat.id : 1
    let lastMatchedId = positionBasedId

    for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        if (header.level !== 1) continue

        const titleText = extractTitleText(header.content || '')

        if (i < anchorIndex) {
            result.get(positionBasedId)!.push(header)
            lastMatchedId = positionBasedId
        } else {
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
                result.get(lastMatchedId)!.push(header)
            }
        }
    }

    return result
}

// ==================== 工具函数 ====================

const extractTitleText = (content: string): string => {
    let text = content.replace(/^#{1,6}\s+/, '')
    text = text.replace(/^\d+(?:[.\-]\d+)*\s+/, '')
    return text.trim()
}

const matchKeywords = (titleText: string, keywords: string[]): boolean => {
    const normalized = titleText.replace(/\u3000/g, ' ').toLowerCase()
    for (const kw of keywords) {
        const normalizedKw = kw.replace(/\u3000/g, ' ').toLowerCase()
        if (normalized.includes(normalizedKw)) return true
    }
    return false
}

// 重新导出为公共函数，供 index.ts 使用
export { matchKeywords as matchRuleKeywords }
