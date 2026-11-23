/**
 * Heading numbering module
 * Provides hierarchical heading numbering with display-only and file-update modes
 */

import { booleanLogseqVersionMd } from '..'
import { getHierarchicalTocBlocks, getHierarchicalTocBlocksForDb, HierarchicalTocBlock } from '../page-outline/findHeaders'
import { settingKeys } from '../settings/keys'
import { normalizePageHeadingsInternal } from '../auto-heading-level'
import { parseNumberingState, getBlockNumberingState, setBlockNumberingState, NumberingState } from './blockStates'
import {
    stripNumberFromContent,
    escapeForRegex,
    MULTI_NUMBER_PATTERN,
    extractOldNumber,
    extractGeneralNumber,
    parseHeadingPrefix,
} from './headingText'
import { detectPageCategoryRule, classifyHeadingsByCategory, ensureDefaultRule, loadAllCategoryRules, clearRuleCache, CategoryRule, matchRuleKeywords, SubHeadingRule } from './categoryRules'
import { initBulletBadges, updateBadgeCacheFromBlocks, applyBulletBadges } from './bulletBadges'

let isFileBasedGraph = false

// === 块编号状态管理（存储为 Logseq 原生块属性 numbering::）===

/**
 * 获取块的编号状态（异步，右键菜单使用）
 * 状态保存在块属性中，不再有外挂缓存
 */
export const getBlockHeadingState = async (blockUuid: string): Promise<NumberingState | null> => {
    return getBlockNumberingState(blockUuid)
}

/**
 * 设置块的编号状态
 * 写入块属性 numbering::，传 null 表示清除
 */
export const setBlockHeadingState = async (blockUuid: string, state: NumberingState | null): Promise<void> => {
    await setBlockNumberingState(blockUuid, state)
}

// Top-level regular expressions and helpers
const HEADING_HASHES_GENERIC = /^#+\s+/
const HEADING_HASHES_PATTERN = /^#{1,6}\s+/
const HEADING_HASHES_ONLY_PATTERN = /^#{1,6}/

// Normalize numeric string to use the given delimiter and collapse extras
const normalizeNumberString = (num: string, delimiter: string) => {
    if (!num) return ''
    // Replace any non-digit sequence with the delimiter
    const replaced = num.trim().replace(/[^0-9]+/g, delimiter)
    // Collapse multiple delimiters
    const collapse = replaced.replace(new RegExp(`${escapeForRegex(delimiter)}{2,}`, 'g'), delimiter)
    // Remove leading/trailing delimiters
    return collapse.replace(new RegExp(`^${escapeForRegex(delimiter)}|${escapeForRegex(delimiter)}$`, 'g'), '')
}

/**
 * 初始化标题编号功能
 * 检测图谱类型并加载分类规则
 */
export const initHeadingNumbering = async () => {
    // 检测当前图谱是否为基于文件的本地图谱
    isFileBasedGraph = await detectFileBasedGraph()

    // 编号状态已改为块属性，无需启动时加载任何配置文件
    // 确保默认分类规则存在并加载规则
    await ensureDefaultRule()
    await loadAllCategoryRules()

    // 块圆点状态角标（▶️ ⏩ ♻️ 🔒）
    initBulletBadges()
}

/**
 * Detect if current graph is file-based (not cloud-based)
 */
const detectFileBasedGraph = async (): Promise<boolean> => {
    try {
        const currentGraph = await logseq.App.getCurrentGraph()
        // File-based graphs have a 'path' property
        return !!(currentGraph && 'path' in currentGraph && currentGraph.path !== null)
    } catch (error) {
        console.warn('Could not detect graph type:', error)
        return false
    }
}

// display-only numbering and related CSS removed

/**
 * 判断编号功能是否可用
 * 纯按钮触发模式，始终可用
 */
export const isPageActive = (_pageUuid: string): boolean => {
    return true
}

/**
 * Apply heading numbers to page blocks (file-update mode)
 */
export const applyHeadingNumbersToPage = async (pageName: string): Promise<void> => {
    // Only work on file-based graphs
    if (!isFileBasedGraph) {
        console.warn('Heading numbering is only available for file-based graphs')
        return
    }

    // First, normalize heading levels if auto-heading-level is enabled
    // This ensures heading levels are correct before applying numbers
    if (logseq.settings?.[settingKeys.toc.autoHeadingLevelEnabled] === true) {
        await normalizePageHeadingsInternal(pageName, true) // silent mode
    }

    const newDelimiter = '.'
    const oldDelimiter = '.'

    try {
        // Get all blocks from the page
        const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName)
        if (!pageBlocks) return

        // 顺便刷新圆点角标缓存（复用同一份块树，避免额外请求）
        updateBadgeCacheFromBlocks(pageBlocks as any)
        applyBulletBadges()

        // === 新增：检测页面是否匹配区间分类规则 ===
        let categoryClassification: Map<number, HierarchicalTocBlock[]> | undefined
        let categoryRule: CategoryRule | null = null

        try {
            categoryRule = await detectPageCategoryRule(pageName)
            if (categoryRule) {
                // 获取层级标题树（用于分类，与后续统一使用同一份数据）
                const versionMd = booleanLogseqVersionMd()
                const hierarchicalHeaders = versionMd
                    ? getHierarchicalTocBlocks(pageBlocks as any)
                    : getHierarchicalTocBlocksForDb(pageBlocks as any)

                categoryClassification = classifyHeadingsByCategory(
                    hierarchicalHeaders,
                    categoryRule
                )
            }
        } catch (e) {
            // 分类失败不影响后续编号，回退到顺序模式
            console.warn('[heading-numbering] 区间分类检测失败，回退到顺序编号:', e)
            categoryClassification = undefined
            categoryRule = null
        }

        // Get hierarchical headers (reuse if already fetched for classification)
        const versionMd = booleanLogseqVersionMd()
        const hierarchicalHeaders = categoryClassification
            ? (versionMd
                ? getHierarchicalTocBlocks(pageBlocks as any)
                : getHierarchicalTocBlocksForDb(pageBlocks as any))
            : (versionMd
                ? getHierarchicalTocBlocks(pageBlocks as any)
                : getHierarchicalTocBlocksForDb(pageBlocks as any))

        // Calculate numbering and update blocks using hierarchy
        // 传入分类结果和规则（如果存在）
        await updateHierarchicalBlocks(
            hierarchicalHeaders, [], newDelimiter, oldDelimiter,
            categoryClassification, categoryRule ?? undefined
        )
    } catch (error) {
        console.error('Error applying heading numbers:', error)
    }
}

// display-only DOM numbering removed


/**
 * 清理子树内所有标题的编号（skip-subtree 的幂等清理）
 *
 * 为什么每次编号都要清理：
 * skip-subtree 的语义是“整棵子树不编号”，但如果子块在标记之前（或手动编辑时）
 * 已经带有编号文本，仅靠“跳过不处理”会让这些旧编号永久残留。
 * 因此每次走到 skip-subtree 分支时都执行一次幂等清理。
 *
 * 保留 locked / repeat：
 * - locked：用户锁定的编号，插件永不修改
 * - repeat：编号依赖上下文，父块 skip-subtree 后无法再自动恢复，清掉就丢了
 *
 * 每处理 10 个块让出一次事件循环，避免大子树批量写入卡住 UI。
 */
const stripNumbersInSubtree = async (children: HierarchicalTocBlock[] | undefined): Promise<void> => {
    if (!children || children.length === 0) return

    let processed = 0

    const walk = async (nodes: HierarchicalTocBlock[]) => {
        for (const node of nodes) {
            const content = node.content || ''
            const state = parseNumberingState(
                node.properties as Record<string, unknown> | undefined,
                content
            )

            if (state !== 'locked' && state !== 'repeat') {
                const newContent = stripNumberFromContent(content)
                if (newContent !== null) {
                    try {
                        await logseq.Editor.updateBlock(node.uuid, newContent)
                        // 同步更新内存中的树，避免后续逻辑读到旧内容
                        node.content = newContent
                    } catch (e) {
                        console.error(`[LSE] 清理块 ${node.uuid} 编号失败:`, e)
                    }
                }
            }

            processed++
            if (processed % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0))
            }

            if (node.children && node.children.length > 0) {
                await walk(node.children)
            }
        }
    }

    await walk(children)
}


/**
 * 基于"看上一个同级兄弟"逻辑的编号推算
 * 
 * 核心规则：
 * 1. heading-num:: skip → 豁免：不修改、不参与编号序列
 * 2. heading-num:: lock → 锁定：不修改文本，提取编号供后续兄弟参考
 * 3. 无属性 → 自动编号：基于上一个同级兄弟的编号 +1
 * 
 * 每个标题的编号 = 找到上一个非 skip 同级兄弟的编号 + 1
 * 如果是该层级的第一个标题，编号为 父标题编号.1
 */
const updateHierarchicalBlocks = async (
    headers: HierarchicalTocBlock[],
    parentNumbers: number[],
    newDelimiter: string,
    oldDelimiter: string,
    categoryClassification?: Map<number, HierarchicalTocBlock[]>,
    categoryRule?: CategoryRule
): Promise<void> => {

    // 存储当前分类的子标题固定编号规则（用于 H1→H2 过渡）
    let _nextLevelSubHeadingRules: SubHeadingRule[] | undefined = undefined

    /**
     * 将标题文本与子标题固定规则匹配
     * @returns 匹配到的规则，或 undefined
     */
    const matchSubHeading = (hd: HierarchicalTocBlock, rules: SubHeadingRule[]): SubHeadingRule | undefined => {
        const headingLine = (hd.content || '').split(/\r?\n/)[0] || ''
        let titleText = headingLine.replace(/^#{1,6}\s+/, '')
        titleText = titleText.replace(/^\d+(?:[.\-]\d+)*\s+/, '').trim()
        for (const rule of rules) {
            if (matchRuleKeywords(titleText, rule.keywords)) {
                return rule
            }
        }
        return undefined
    }

    /**
     * 处理同级标题列表
     * @param siblings 同级标题数组
     * @param parentNumberStr 父标题的编号字符串（如 "6"）,顶级标题为空
     * @param categoryPrefix 区间编号前缀（仅顶级且分类模式时使用），如区间2传 20
     * @param subHeadingRules 子标题固定编号规则（仅子标题层级使用）
     */
    const processSiblings = async (
        siblings: HierarchicalTocBlock[],
        parentNumberStr: string,
        categoryPrefix?: number,
        subHeadingRules?: SubHeadingRule[]
    ) => {
        // 记录上一个非 skip 同级标题的序号（仅最后一段数字）
        let lastSiblingNumber = 0

        for (const node of siblings) {
            const level = node.level || 1

            // 跳过 5 级及以上标题，不参与编号
            if (level > 4) continue

            // 从块属性读取编号状态（properties 已由块树透传，零额外 API 调用）
            const headingNumProp = parseNumberingState(
                node.properties as Record<string, unknown> | undefined,
                node.content
            )

            // 1. 整棵子树豁免（最高优先级）
            // skip-subtree：自身与所有后代都不编号；同时做一次幂等清理，
            // 保证子树里在标记之前就已存在的旧编号也会被移除
            if (headingNumProp === 'skip-subtree') {
                await stripNumbersInSubtree(node.children)
                continue
            }

            // 1.5 单块豁免检测
            if (headingNumProp === 'skip') {                // 跳过此标题，不修改、不影响编号序列
                // 但仍需递归处理其子标题
                if (node.children && node.children.length > 0) {
                    // skip 标题的子标题继承父级的编号前缀；H1→H2 过渡时传入分类的子标题规则
                    await processSiblings(node.children, parentNumberStr, undefined,
                        categoryPrefix !== undefined ? _nextLevelSubHeadingRules : undefined)
                }
                continue
            }

            // 2. 锁定检测（locked）
            if (headingNumProp === 'locked') {
                // 不修改标题文本，但提取其编号供后续兄弟参考
                const fullContent = node.content || ''
                const lines = fullContent.split(/\r?\n/)
                const firstLine = lines.length > 0 ? lines[0] : ''
                
                // 从标题文本中提取编号
                const extractedNumber = extractNumberFromHeading(firstLine, oldDelimiter)
                if (extractedNumber !== null) {
                    // 提取最后一段数字作为当前层级的序号
                    const parts = extractedNumber.split(/[.\-_→\s]+/).filter(Boolean)
                    const lastPart = parseInt(parts[parts.length - 1], 10)
                    if (!isNaN(lastPart)) {
                        lastSiblingNumber = lastPart
                    }
                }

                // 递归处理锁定标题的子标题
                if (node.children && node.children.length > 0) {
                    const currentFullNumber = extractedNumber || (parentNumberStr ? `${parentNumberStr}${newDelimiter}${lastSiblingNumber}` : `${lastSiblingNumber}`)
                    await processSiblings(node.children, currentFullNumber, undefined,
                        categoryPrefix !== undefined ? _nextLevelSubHeadingRules : undefined)
                }
                continue
            }

            // 2.5 重复检测（repeat）：动态跟随上一个同级兄弟的编号
            // 不递增 lastSiblingNumber，直接使用上一个兄弟的编号来更新文本
            if (headingNumProp === 'repeat') {
                // 如果还没有上一个兄弟（是第一个标题），用 1
                const repeatNumber = lastSiblingNumber > 0 ? lastSiblingNumber : 1

                // 构建完整编号（与上一个兄弟相同）
                // H4 特殊格式：仅用序号+顿号，不带父级前缀
                // 分类模式的顶级标题沿用区间前缀（区间 0 → 01、02）
                const currentFullNumber = level === 4
                    ? `${repeatNumber}`
                    : (parentNumberStr
                        ? `${parentNumberStr}${newDelimiter}${repeatNumber}`
                        : (categoryPrefix !== undefined
                            ? formatCategoryNumber(categoryPrefix + repeatNumber)
                            : `${repeatNumber}`))

                // 像普通标题一样处理文本更新
                const fullContent = node.content || ''
                const lines = fullContent.split(/\r?\n/)
                const firstLine = lines.length > 0 ? lines[0] : ''

                // 统一解析旧编号（含年份保护）
                const { oldNumber, textWithoutNumber } = parseHeadingPrefix(firstLine, level, oldDelimiter)

                const normalizedExpected = normalizeNumberString(currentFullNumber, newDelimiter)
                const normalizedOld = oldNumber ? normalizeNumberString(oldNumber, newDelimiter) : null

                if (!oldNumber || normalizedOld !== normalizedExpected) {
                    const textOnly = textWithoutNumber.replace(HEADING_HASHES_GENERIC, '')
                    if (textOnly.trim()) {
                        const hashTags = '#'.repeat(level)
                        // H4 特殊格式：n、标题（无空格）
                        const newFirstLine = level === 4
                            ? `${hashTags} ${currentFullNumber}、${textOnly.trim()}`
                            : `${hashTags} ${currentFullNumber} ${textOnly}`
                        const newFullContent = [newFirstLine, ...lines.slice(1)].join('\n')
                        if (newFullContent !== fullContent) {
                            try {
                                await logseq.Editor.updateBlock(node.uuid, newFullContent)
                                node.content = newFullContent
                            } catch (error) {
                                console.error(`更新重复编号块 ${node.uuid} 失败:`, error)
                            }
                        }
                    }
                }

                // 注意：不递增 lastSiblingNumber，保持不变
                // 递归处理子标题
                if (node.children && node.children.length > 0) {
                    await processSiblings(node.children, currentFullNumber, undefined,
                        categoryPrefix !== undefined ? _nextLevelSubHeadingRules : undefined)
                }
                continue
            }

            // 2.6 子标题固定编号（关键词匹配）
            // 适用于：(有 categoryPrefix 的 H1 分类级) 或 (有 parentNumberStr 的 H2/H3 子级)
            if (subHeadingRules && subHeadingRules.length > 0 && (categoryPrefix !== undefined || parentNumberStr)) {
                const matchedRule = matchSubHeading(node, subHeadingRules)
                if (matchedRule) {
                    lastSiblingNumber = Math.max(lastSiblingNumber, matchedRule.number)
                    // 分类级：categoryPrefix + 固定个位；子级：父编号.固定个位
                    const currentFullNumber = categoryPrefix !== undefined
                        ? formatCategoryNumber(categoryPrefix + matchedRule.number)
                        : `${parentNumberStr}${newDelimiter}${matchedRule.number}`

                    // 更新标题文本（内联，与自动编号逻辑一致）
                    const fullContent2 = node.content || ''
                    const lines2 = fullContent2.split(/\r?\n/)
                    const firstLine2 = lines2.length > 0 ? lines2[0] : ''

                    // 统一解析旧编号（含年份保护）
                    const { oldNumber: oldNum2, textWithoutNumber: textWithoutNum2 } =
                        parseHeadingPrefix(firstLine2, level, oldDelimiter)

                    const normExp2 = normalizeNumberString(currentFullNumber, newDelimiter)
                    const normOld2 = oldNum2 ? normalizeNumberString(oldNum2, newDelimiter) : null
                    if (!oldNum2 || normOld2 !== normExp2) {
                        const textOnly2 = textWithoutNum2.replace(HEADING_HASHES_GENERIC, '')
                        if (textOnly2.trim()) {
                            const ht2 = '#'.repeat(level)
                            const newLine2 = level === 4
                                ? `${ht2} ${currentFullNumber}、${textOnly2.trim()}`
                                : `${ht2} ${currentFullNumber} ${textOnly2}`
                            const newContent2 = [newLine2, ...lines2.slice(1)].join('\n')
                            if (newContent2 !== fullContent2) {
                                try {
                                    await logseq.Editor.updateBlock(node.uuid, newContent2)
                                    node.content = newContent2
                                } catch (error) {
                                    console.error(`更新固定编号块 ${node.uuid} 失败:`, error)
                                }
                            }
                        }
                    }

                    // 递归：传递匹配规则的嵌套子规则
                    if (node.children && node.children.length > 0) {
                        await processSiblings(node.children, currentFullNumber, undefined, matchedRule.subHeadings)
                    }
                    continue
                }
                // 未匹配到固定规则则回退到顺序编号（下方 3. 自动编号）
            }

            // 3. 自动编号（无属性的普通标题）
            // 基于上一个同级兄弟的编号 +1
            lastSiblingNumber += 1

            // 构建完整编号
            // H4 特殊格式：仅用序号+顿号，不带父级前缀
            // 顶级标题且处于分类模式时：使用 categoryPrefix + 序号
            const currentFullNumber = level === 4
                ? `${lastSiblingNumber}`
                : (parentNumberStr
                    ? `${parentNumberStr}${newDelimiter}${lastSiblingNumber}`
                    : (categoryPrefix !== undefined
                        ? formatCategoryNumber(categoryPrefix + lastSiblingNumber)
                        : `${lastSiblingNumber}`))

            // 处理标题文本
            const fullContent = node.content || ''
            const lines = fullContent.split(/\r?\n/)
            const firstLine = lines.length > 0 ? lines[0] : ''

            // 提取旧编号（如果有）
            // 统一解析旧编号（含年份保护）
            const { oldNumber, textWithoutNumber } = parseHeadingPrefix(firstLine, level, oldDelimiter)

            // 比较当前编号与期望编号
            const normalizedExpected = normalizeNumberString(currentFullNumber, newDelimiter)
            const normalizedOld = oldNumber ? normalizeNumberString(oldNumber, newDelimiter) : null

            let needsUpdate = false
            if (!oldNumber) {
                // 没有编号 → 需要添加
                needsUpdate = true
            } else if (normalizedOld !== normalizedExpected) {
                // 编号不一致 → 需要更新
                needsUpdate = true
            }

            if (needsUpdate) {
                const textOnly = textWithoutNumber.replace(HEADING_HASHES_GENERIC, '')
                if (textOnly.trim()) {
                    const hashTags = '#'.repeat(level)
                    // H4 特殊格式：n、标题（无空格）
                    const newFirstLine = level === 4
                        ? `${hashTags} ${currentFullNumber}、${textOnly.trim()}`
                        : `${hashTags} ${currentFullNumber} ${textOnly}`
                    const newFullContent = [newFirstLine, ...lines.slice(1)].join('\n')
                    if (newFullContent !== fullContent) {
                        try {
                            await logseq.Editor.updateBlock(node.uuid, newFullContent)
                            node.content = newFullContent
                        } catch (error) {
                            console.error(`更新块 ${node.uuid} 失败:`, error)
                        }
                    }
                }
            }

            // 递归处理子标题
            if (node.children && node.children.length > 0) {
                await processSiblings(node.children, currentFullNumber, undefined,
                    categoryPrefix !== undefined ? _nextLevelSubHeadingRules : undefined)
            }
        }
    }

    // 顶级标题处理
    // 分类模式：按区间依次处理，每个区间内的标题使用对应的编号前缀
    if (categoryClassification && categoryRule && parentNumbers.length === 0) {
        for (const cat of categoryRule.categories) {
            const catHeaders = categoryClassification.get(cat.id) || []
            if (catHeaders.length === 0) continue
            const catPrefix = cat.id * 10
            // cat.subHeadings 用于 H1 分类级固定编号；_nextLevelSubHeadingRules 用于 H1→H2 递归
            _nextLevelSubHeadingRules = cat.subHeadings
            await processSiblings(catHeaders, '', catPrefix, cat.subHeadings)
        }
        _nextLevelSubHeadingRules = undefined
    } else {
        // 普通模式：所有标题作为同级顺序编号
        await processSiblings(headers, '')
    }
}

/**
 * 从标题文本中提取编号
 * 例如 "## 6.5 关系变化" → "6.5"
 */
const extractNumberFromHeading = (firstLine: string, delimiter: string): string | null => {
    const { number } = extractOldNumber(firstLine, delimiter)
    if (number) return number
    return extractGeneralNumber(firstLine)
}

/**
 * 分类模式下 H1 编号的格式化
 *
 * 区间前缀 = id × 10，区间 0 的前缀就是 0，直接相加只会得到 1、2。
 * 这里统一补足两位，让区间 0 输出 01、02，与区间 1 的 11、区间 2 的 21
 * 保持同样的两位数观感；id ≥ 1 本来已是两位，补零不改变结果。
 */
const formatCategoryNumber = (n: number): string => String(n).padStart(2, '0')

/**
 * 处理编号相关设置变更
 * 纯按钮触发模式下，无需处理模式切换逻辑，仅当 autoHeadingLevel 变更时需要重新加载设置面板
 */
export const handleHeadingNumberingSettingsChanged = async (_newSet: any, _oldSet: any): Promise<boolean> => {
    // 设置变更时清除规则缓存，下次重新编号时会重新加载
    clearRuleCache()
    // 纯按钮触发模式，无需自动响应设置变更
    return false
}

/**
 * Clean up heading numbers from a single page
 * Returns the number of blocks cleaned
 */
export const cleanupPageHeadingNumbers = async (pageName: string, oldDelimiter: string): Promise<number> => {
    try {
        // Get all blocks from the page
        const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName)
        if (!pageBlocks) return 0

        // Get hierarchical headers
        const versionMd = booleanLogseqVersionMd()
        const hierarchicalHeaders = versionMd
            ? getHierarchicalTocBlocks(pageBlocks as any)
            : getHierarchicalTocBlocksForDb(pageBlocks as any)

        // Remove numbering from all headers
        let cleanedCount = 0
        const removeFromHeaders = async (headers: HierarchicalTocBlock[]) => {
            for (const header of headers) {
                // Work on the first line only and preserve remaining lines
                const fullContent = header.content || ''
                const lines = fullContent.split(/\r?\n/)
                const firstLine = lines.length > 0 ? lines[0] : ''

                // Try to extract old number using delimiter from first line
                const { number: oldNumber, textWithoutNumber } = extractOldNumber(firstLine, oldDelimiter)

                // Also handle cases with multiple/duplicate numbers or corrupted numbering on first line
                const multiMatch = firstLine.match(MULTI_NUMBER_PATTERN)

                let shouldClean = false
                let cleanedText = ''
                let hashTags = ''

                // 获取当前块用户设置的状态：'skip' | 'skip-subtree' | 'repeat' | 'locked' | null
                const state = parseNumberingState(
                    header.properties as Record<string, unknown> | undefined,
                    header.content
                )
                const isLockedOrRepeat = state === 'locked' || state === 'repeat'

                // H4 专用匹配
                const h4Match = header.level === 4 ? firstLine.match(/^(#{4})\s+(\d+)、\s*(.+)$/) : null

                if (isLockedOrRepeat) {
                    // 处于 locked 或 repeat 状态的标题不进行清理
                    shouldClean = false
                } else if (h4Match) {
                    shouldClean = true
                    hashTags = h4Match[1]
                    cleanedText = h4Match[3].trim()
                } else if (oldNumber) {
                    // Has a number detected by delimiter pattern
                    shouldClean = true
                    const textOnly = textWithoutNumber.replace(HEADING_HASHES_PATTERN, '')
                    hashTags = textWithoutNumber.match(HEADING_HASHES_ONLY_PATTERN)?.[0] || ''
                    cleanedText = textOnly
                } else if (multiMatch) {
                    // Has multiple/duplicate numbers or corrupted numbering
                    shouldClean = true
                    hashTags = multiMatch[1]
                    cleanedText = multiMatch[2]
                }

                if (shouldClean && cleanedText.trim()) {
                    const level = header.level
                    const newHashTags = hashTags || '#'.repeat(level)
                    const newFirstLine = `${newHashTags} ${cleanedText}`
                    const newContent = [newFirstLine, ...lines.slice(1)].join('\n')

                    if (newContent !== fullContent) {
                        try {
                            await logseq.Editor.updateBlock(header.uuid, newContent)
                            cleanedCount++
                        } catch (error) {
                            console.error(`Failed to clean block ${header.uuid}:`, error)
                        }
                    }
                }

                // Recursively process children
                if (header.children && header.children.length > 0) {
                    await removeFromHeaders(header.children)
                }
            }
        }

        await removeFromHeaders(hierarchicalHeaders)
        return cleanedCount
    } catch (error) {
        console.error(`Error cleaning page ${pageName}:`, error)
        return 0
    }
}
