/**
 * Heading numbering module
 * Provides hierarchical heading numbering with display-only and file-update modes
 */

import { booleanLogseqVersionMd } from '..'
import { getHierarchicalTocBlocks, getHierarchicalTocBlocksForDb, HierarchicalTocBlock } from '../page-outline/findHeaders'
import { settingKeys } from '../settings/keys'
import { normalizePageHeadingsInternal } from '../auto-heading-level'

let isFileBasedGraph = false

// === 块编号状态管理（存储在插件设置中，不使用 block properties）===

/**
 * 获取块的编号状态（skip / lock / repeat / undefined）
 * 使用扁平键 headingState_{uuid} 直接存储，避免嵌套对象的延迟与覆盖问题
 */
export const getBlockHeadingState = (blockUuid: string): string | undefined => {
    const val = logseq.settings?.[`headingState_${blockUuid}`]
    if (val && typeof val === 'string') return val
    return undefined
}

/**
 * 设置块的编号状态
 * 扁平化存储：每个块一个独立的顶层 key，同步生效，没有延迟
 */
export const setBlockHeadingState = (blockUuid: string, state: string | null) => {
    const key = `headingState_${blockUuid}`
    if (state === null) {
        // 写入空字符串表示清除（Logseq 不支持真正删除 key）
        logseq.updateSettings({ [key]: '' })
    } else {
        logseq.updateSettings({ [key]: state })
    }
}

// Top-level regular expressions and helpers
const HEADING_HASHES_GENERIC = /^#+\s+/
const HEADING_HASHES_PATTERN = /^#{1,6}\s+/
const HEADING_HASHES_ONLY_PATTERN = /^#{1,6}/
const MULTI_NUMBER_PATTERN = /^(#{1,6})\s+(?:\d+[\d\.\-_\s→]*)+\s+(.+)$/

const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createExtractOldNumberRegex = (oldDelimiter: string) => {
    const escapedDelimiter = escapeForRegex(oldDelimiter)
    return new RegExp(`^(#{1,6})\\s+(\\d+(?:${escapedDelimiter}\\d+)*${escapedDelimiter}?)\\s+(.+)$`)
}

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

// Extract a general number sequence after hashes when delimiter-specific extract fails
const extractGeneralNumber = (content: string): string | null => {
    const m = content.match(/^(?:#{1,6})\s+([0-9][0-9\.\-\_\s→]*)/)
    return m ? m[1].trim() : null
}

/**
 * Initialize heading numbering features
 */
export const initHeadingNumbering = async () => {
    // Detect if current graph is file-based
    isFileBasedGraph = await detectFileBasedGraph()

    // Apply initial settings
    // display-only numbering and level marks removed
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
 * Check if page should have heading numbering features applied
 */
export const isPageActive = (pageName: string): boolean => {
    const storageMode = logseq.settings?.[settingKeys.toc.pageStateStorageMode] as string || 'storeTrueOnly'
    const pageStates = logseq.settings?.[settingKeys.toc.pageStates] as Record<string, boolean> || {}

    console.log('Checking if page is active:', pageName, 'Storage mode:', storageMode, 'Page states:', pageStates)

    if (storageMode === 'storeTrueOnly') {
        // Only pages explicitly set to true are active
        return pageStates[pageName] === true
    } else {
        // All pages active except those explicitly set to false
        return pageStates[pageName] !== false
    }
}

/**
 * Toggle page activation state
 */
export const togglePageState = async (pageName: string): Promise<{ newState: boolean; hadEntry: boolean }> => {

    const pageStates = logseq.settings?.[settingKeys.toc.pageStates] as Record<string, boolean> || {}

    const currentState = isPageActive(pageName)
    const newState = !currentState

    const storageMode = logseq.settings?.[settingKeys.toc.pageStateStorageMode] as string || 'storeTrueOnly'
    if (storageMode === 'storeTrueOnly') {
        if (newState) {
            pageStates[pageName] = true
        } else {
            delete pageStates[pageName]
            await executeCleanup()
        }
    } else {
        // storeFalseOnly
        if (newState) {
            delete pageStates[pageName]
        } else {
            pageStates[pageName] = false
            await executeCleanup()
        }
    }
    logseq.updateSettings({
        [settingKeys.toc.pageStates]: null
    })
    // Debugging logs
    setTimeout(() => {
        logseq.updateSettings({
            [settingKeys.toc.pageStates]: pageStates
        })
    }, 100)
    const hadEntry = Object.prototype.hasOwnProperty.call(pageStates, pageName)
    return { newState, hadEntry }
}

/**
 * Extract heading number from content using old delimiter
 * This function detects if a heading already has numbering and extracts it
 */
const extractOldNumber = (content: string, oldDelimiter: string): { number: string | null, textWithoutNumber: string } => {
    // Pattern to match: "# 1.2.3 Text" or "## 1.2 Text" or "### 3.1 Text" etc.
    // Use helper to create regex with escaped delimiter
    const pattern = createExtractOldNumberRegex(oldDelimiter)
    const match = content.match(pattern)

    if (match) {
        const hashTags = match[1]
        let number = match[2]
        const text = match[3]

        // Remove trailing delimiter if present
        if (number.endsWith(oldDelimiter)) {
            number = number.slice(0, -oldDelimiter.length)
        }

        return {
            number,
            textWithoutNumber: `${hashTags} ${text}`
        }
    }

    return {
        number: null,
        textWithoutNumber: content
    }
}


/**
 * Apply heading numbers to page blocks (file-update mode)
 */
export const applyHeadingNumbersToPage = async (pageName: string): Promise<void> => {
    // Only work on file-based graphs
    if (!isFileBasedGraph) {
        console.warn('Heading numbering file-update mode is only available for file-based graphs')
        return
    }

    // Check if file-update mode is enabled
    if (logseq.settings?.[settingKeys.toc.headingNumberFileEnable] !== true) {
        return
    }

    // Check if page is active
    if (!isPageActive(pageName)) {
        return
    }

    // First, normalize heading levels if auto-heading-level is enabled
    // This ensures heading levels are correct before applying numbers
    if (logseq.settings?.[settingKeys.toc.autoHeadingLevelEnabled] === true) {
        await normalizePageHeadingsInternal(pageName, true) // silent mode
    }

    const newDelimiter = (logseq.settings?.[settingKeys.toc.headingNumberDelimiterFile] as string) || '.'
    const oldDelimiter = (logseq.settings?.[settingKeys.toc.headingNumberDelimiterFileOld] as string) || '.'

    try {
        // Get all blocks from the page
        const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName)
        if (!pageBlocks) return

        // Get hierarchical headers
        const versionMd = booleanLogseqVersionMd()
        const hierarchicalHeaders = versionMd
            ? getHierarchicalTocBlocks(pageBlocks as any)
            : getHierarchicalTocBlocksForDb(pageBlocks as any)

        // Calculate numbering and update blocks using hierarchy
        await updateHierarchicalBlocks(hierarchicalHeaders, [], newDelimiter, oldDelimiter)
    } catch (error) {
        console.error('Error applying heading numbers:', error)
    }
}

// display-only DOM numbering removed


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
    oldDelimiter: string
): Promise<void> => {

    /**
     * 处理同级标题列表
     * @param siblings 同级标题数组
     * @param parentNumberStr 父标题的编号字符串（如 "6"）,顶级标题为空
     */
    const processSiblings = async (siblings: HierarchicalTocBlock[], parentNumberStr: string) => {
        // 记录上一个非 skip 同级标题的序号（仅最后一段数字）
        let lastSiblingNumber = 0

        for (const node of siblings) {
            const level = node.level || 1

            // 从插件设置读取编号状态（而非 block properties）
            const headingNumProp = getBlockHeadingState(node.uuid)

            // 1. 豁免检测（最高优先级）
            if (headingNumProp === 'skip') {
                // 跳过此标题，不修改、不影响编号序列
                // 但仍需递归处理其子标题
                if (node.children && node.children.length > 0) {
                    // skip 标题的子标题继承父级的编号前缀
                    await processSiblings(node.children, parentNumberStr)
                }
                continue
            }

            // 2. 锁定检测（仅 lock）
            if (headingNumProp === 'lock') {
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
                    await processSiblings(node.children, currentFullNumber)
                }
                continue
            }

            // 2.5 重复检测（repeat）：动态跟随上一个同级兄弟的编号
            // 不递增 lastSiblingNumber，直接使用上一个兄弟的编号来更新文本
            if (headingNumProp === 'repeat') {
                // 如果还没有上一个兄弟（是第一个标题），用 1
                const repeatNumber = lastSiblingNumber > 0 ? lastSiblingNumber : 1

                // 构建完整编号（与上一个兄弟相同）
                const currentFullNumber = parentNumberStr
                    ? `${parentNumberStr}${newDelimiter}${repeatNumber}`
                    : `${repeatNumber}`

                // 像普通标题一样处理文本更新
                const fullContent = node.content || ''
                const lines = fullContent.split(/\r?\n/)
                const firstLine = lines.length > 0 ? lines[0] : ''

                let { number: oldNumber, textWithoutNumber } = extractOldNumber(firstLine, oldDelimiter)
                if (!oldNumber) {
                    const mm = firstLine.match(MULTI_NUMBER_PATTERN)
                    if (mm) {
                        const hashTags = mm[1]
                        const restText = mm[2]
                        const numPartMatch = firstLine.match(new RegExp(`^${escapeForRegex(hashTags)}\\s+([0-9\\.\\-\\_\\s→]+)\\s+`))
                        const numPart = numPartMatch ? numPartMatch[1].trim() : null
                        if (numPart) {
                            oldNumber = numPart
                            textWithoutNumber = `${hashTags} ${restText}`
                        }
                    }
                    if (!oldNumber) {
                        const gen = extractGeneralNumber(firstLine)
                        if (gen) {
                            oldNumber = gen
                            textWithoutNumber = firstLine.replace(new RegExp(`^(#{1,6})\\s+${escapeForRegex(gen)}\\s+`), '$1 ')
                        }
                    }
                }

                const normalizedExpected = normalizeNumberString(currentFullNumber, newDelimiter)
                const normalizedOld = oldNumber ? normalizeNumberString(oldNumber, newDelimiter) : null

                if (!oldNumber || normalizedOld !== normalizedExpected) {
                    const textOnly = textWithoutNumber.replace(HEADING_HASHES_GENERIC, '')
                    if (textOnly.trim()) {
                        const hashTags = '#'.repeat(level)
                        const newFirstLine = `${hashTags} ${currentFullNumber} ${textOnly}`
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
                    await processSiblings(node.children, currentFullNumber)
                }
                continue
            }

            // 3. 自动编号（无属性的普通标题）
            // 基于上一个同级兄弟的编号 +1
            lastSiblingNumber += 1

            // 构建完整编号
            const currentFullNumber = parentNumberStr
                ? `${parentNumberStr}${newDelimiter}${lastSiblingNumber}`
                : `${lastSiblingNumber}`

            // 处理标题文本
            const fullContent = node.content || ''
            const lines = fullContent.split(/\r?\n/)
            const firstLine = lines.length > 0 ? lines[0] : ''

            // 提取旧编号（如果有）
            let { number: oldNumber, textWithoutNumber } = extractOldNumber(firstLine, oldDelimiter)

            // 如果分隔符提取失败，尝试通用提取
            if (!oldNumber) {
                const mm = firstLine.match(MULTI_NUMBER_PATTERN)
                if (mm) {
                    const hashTags = mm[1]
                    const restText = mm[2]
                    const numPartMatch = firstLine.match(new RegExp(`^${escapeForRegex(hashTags)}\\s+([0-9\\.\\-\\_\\s→]+)\\s+`))
                    const numPart = numPartMatch ? numPartMatch[1].trim() : null
                    if (numPart) {
                        oldNumber = numPart
                        textWithoutNumber = `${hashTags} ${restText}`
                    }
                }
                if (!oldNumber) {
                    const gen = extractGeneralNumber(firstLine)
                    if (gen) {
                        oldNumber = gen
                        textWithoutNumber = firstLine.replace(new RegExp(`^(#{1,6})\\s+${escapeForRegex(gen)}\\s+`), '$1 ')
                    }
                }
            }

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
                    const newFirstLine = `${hashTags} ${currentFullNumber} ${textOnly}`
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
                await processSiblings(node.children, currentFullNumber)
            }
        }
    }

    // 从顶级标题开始处理
    await processSiblings(headers, '')
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
 * Handle settings changed
 */
export const handleHeadingNumberingSettingsChanged = async (newSet: any, oldSet: any): Promise<boolean> => {
    // display-only numbering and heading level marks removed

    // Cleanup mode - remove all heading numbers
    if (oldSet[settingKeys.toc.headingNumberCleanup] !== newSet[settingKeys.toc.headingNumberCleanup] &&
        newSet[settingKeys.toc.headingNumberCleanup] === true) {
        await executeCleanup()
    }

    // File-update mode changes
    if (oldSet[settingKeys.toc.headingNumberFileEnable] !== newSet[settingKeys.toc.headingNumberFileEnable] ||
        oldSet[settingKeys.toc.headingNumberDelimiterFile] !== newSet[settingKeys.toc.headingNumberDelimiterFile] ||
        oldSet[settingKeys.toc.headingNumberDelimiterFileOld] !== newSet[settingKeys.toc.headingNumberDelimiterFileOld]) {
        // Re-apply  numbering to current page if enabled
        const currentPage = await logseq.Editor.getCurrentPage()
        if (currentPage && newSet[settingKeys.toc.headingNumberFileEnable] === true) {
            const pageName = (currentPage.originalName || currentPage.name || '') as string
            if (pageName) {
                await applyHeadingNumbersToPage(pageName)
            }
        }
    }
    if (oldSet[settingKeys.toc.headingNumberFileEnable] !== newSet[settingKeys.toc.headingNumberFileEnable])
        return true
    return false
}

/**
 * Execute cleanup - remove all heading numbers from the current page
 */
const executeCleanup = async (): Promise<void> => {
    try {
        // Get the currently open page
        const currentPage = await logseq.Editor.getCurrentPage()
        if (!currentPage) {
            await logseq.UI.showMsg('⚠️ Please open a page to clean up heading numbers', 'warning')
            await resetCleanupFlag()
            return
        }

        const currentPageName = currentPage.originalName || currentPage.name
        if (typeof currentPageName !== 'string' || !currentPageName) {
            await logseq.UI.showMsg('⚠️ Could not determine current page name', 'warning')
            await resetCleanupFlag()
            return
        }

        const pageName = currentPageName

        // Show user message
        await logseq.UI.showMsg(
            `⚠️ Starting cleanup: Removing heading numbers from "${pageName}"...`,
            'warning',
            { timeout: 3000 }
        )

        console.log(`Starting heading number cleanup for page: ${pageName}`)

        // Get delimiter settings to detect existing numbers
        const delimiterSetting = logseq.settings?.[settingKeys.toc.headingNumberDelimiterFileOld]
        const oldDelimiter: string = typeof delimiterSetting === 'string' ? delimiterSetting : '.'

        // Clean the current page
        const totalCleaned = await cleanupPageHeadingNumbers(pageName, oldDelimiter)

        // Show completion message
        if (totalCleaned > 0) {
            await logseq.UI.showMsg(
                `✓ Cleanup complete! Removed ${totalCleaned} heading number(s) from "${pageName}".`,
                'success',
                { timeout: 5000 }
            )
            console.log(`Cleanup complete: ${totalCleaned} numbers removed from "${pageName}"`)
        } else {
            await logseq.UI.showMsg(
                `No heading numbers found to clean on "${pageName}".`,
                'info',
                { timeout: 3000 }
            )
            console.log(`No heading numbers found on "${pageName}"`)
        }

    } catch (error) {
        console.error('Error during cleanup:', error)
        await logseq.UI.showMsg(`Error during cleanup: ${error}`, 'error')
    } finally {
        // Always reset the cleanup flag
        await resetCleanupFlag()
    }
}

/**
 * Reset the cleanup flag to false
 */
const resetCleanupFlag = async (): Promise<void> => {
    logseq.updateSettings({
        [settingKeys.toc.headingNumberCleanup]: false
    })
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

                // 获取当前块用户设置的状态：'skip' | 'lock' | 'repeat' | null
                const state = getBlockHeadingState(header.uuid)
                const isLockedOrRepeat = state === 'lock' || state === 'repeat'

                if (isLockedOrRepeat) {
                    // 处于 lock 或 repeat 状态的标题不进行清理
                    shouldClean = false
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
