/**
 * 标题行文本处理（共享工具）
 *
 * 编号算法（index.ts）和右键菜单（headingButtons.ts）都需要判断标题、
 * 剥离编号前缀。这些规则必须完全一致，否则会出现“菜单能清、编号不清”
 * 或者“年份在一处被保护、在另一处被吞掉”的漂移问题，因此集中在这里。
 */

/** 判断块内容是否为标题 */
export const isHeadingContent = (content: string): boolean => /^#{1,6}\s+/.test(content)

/**
 * 判断标题是否以“不可能是编号”的多位数字开头
 *
 * 编号按层级递增，单层标题数量不可能达到 100 个，因此 3 位及以上的数字
 * 一律视为正文（覆盖 100–9999 以及更长的数字）。
 * 例如 "## 2023 年总结"、"## 100 的" 都不能被剥掉数字。
 */
export const isMultiDigitLeadingHeading = (content: string): boolean => {
    const firstLine = (content || '').split(/\r?\n/)[0] || ''
    return /^#{1,6}\s+\d{3,}(?:\s|、|$)/.test(firstLine)
}

/**
 * 从标题内容中剥离编号前缀，返回新内容
 * 无需修改时返回 null（调用方据此跳过写入）
 *
 * 支持：
 *   "## 1.2.3 标题"  → "## 标题"
 *   "#### 3、标题"    → "#### 标题"
 *   "#### 3、 标题"   → "#### 标题"
 *
 * 只改第一行，块内其余行（尤其是 numbering:: 属性行）原样保留。
 */
export const stripNumberFromContent = (content: string): string | null => {
    const lines = content.split(/\r?\n/)
    const firstLine = lines[0] || ''

    const hashMatch = firstLine.match(/^(#{1,6})\s+/)
    if (!hashMatch) return null

    // 多位数字保护：不把 "2023 年总结"、"100 的" 里的数字当编号剥掉
    if (isMultiDigitLeadingHeading(content)) return null

    const hashTags = hashMatch[1]
    let textOnly = firstLine.replace(/^#{1,6}\s+/, '')
    textOnly = textOnly
        .replace(/^[\d.]+\s+/, '')      // "1.2.3 " 格式
        .replace(/^\d+、\s*/, '')        // "3、" / "3、 " 格式

    if (!textOnly.trim()) return null

    const newFirstLine = `${hashTags} ${textOnly}`
    const newContent = [newFirstLine, ...lines.slice(1)].join('\n')
    return newContent === content ? null : newContent
}

// ==================== 旧编号前缀解析 ====================
//
// 下面是编号算法专用的解析工具，集中在这里的原因：
// 1. 三种状态分支（repeat / 固定子标题 / 自动编号）要用完全相同的规则
// 2. 多位数字保护必须覆盖所有匹配路径，漏一条就会把 2002 当成编号吞掉
// 3. 纯函数便于单独测试

/** 多段数字编号（历史遗留的杂乱写法，如 "1-2 3 标题"） */
export const MULTI_NUMBER_PATTERN = /^(#{1,6})\s+(?:\d+[\d\.\-_\s→]*)+\s+(.+)$/

/** 正则转义 */
export const escapeForRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 判断一个数字串是否“不可能是编号”
 *
 * 编号按层级递增，单层标题数量不可能达到 100 个，因此 3 位及以上的数字
 * 一律视为正文（覆盖 100–9999 以及更长的数字）：
 * 既包括 2002 这类年份，也包括 100、9999 等其他长数字。
 */
export const isNonNumberingNumber = (num: string): boolean => /^\d{3,}$/.test(num)

/** 按分隔符构造“旧编号”匹配正则 */
const createExtractOldNumberRegex = (oldDelimiter: string) => {
    const escapedDelimiter = escapeForRegex(oldDelimiter)
    return new RegExp(`^(#{1,6})\\s+(\\d+(?:${escapedDelimiter}\\d+)*${escapedDelimiter}?)\\s+(.+)$`)
}

/**
 * 宽松提取标题开头的数字串（分隔符匹配失败时的回退）
 * 多位数字保护：首段是 3 位及以上数字时返回 null，表示“这不是编号”
 */
export const extractGeneralNumber = (content: string): string | null => {
    const m = content.match(/^(?:#{1,6})\s+([0-9][0-9\.\-\_\s→]*)/)
    if (!m) return null

    const num = m[1].trim()
    const firstToken = num.split(/[.\-_\s→]+/)[0]
    if (isNonNumberingNumber(firstToken)) return null

    return num
}

/**
 * 用指定分隔符提取标题里的旧编号
 *
 * 多位数字保护：识别到的数字是 3 位及以上时按“无编号”处理，
 * 并原样返回内容，避免后续重写吞掉这个数字。
 */
export const extractOldNumber = (
    content: string,
    oldDelimiter: string
): { number: string | null, textWithoutNumber: string } => {
    const pattern = createExtractOldNumberRegex(oldDelimiter)
    const match = content.match(pattern)

    if (match) {
        const hashTags = match[1]
        let number = match[2]
        const text = match[3]

        if (number.endsWith(oldDelimiter)) {
            number = number.slice(0, -oldDelimiter.length)
        }

        if (isNonNumberingNumber(number)) {
            return { number: null, textWithoutNumber: content }
        }

        return { number, textWithoutNumber: `${hashTags} ${text}` }
    }

    return { number: null, textWithoutNumber: content }
}

/**
 * 统一解析标题行的“旧编号前缀”
 *
 * 按优先级依次尝试：
 *   "## 1.2.3 标题" / "#### 3、标题" / "## 1 2002 的"
 *
 * ⚠️ 多位数字保护的含义是“不把 2002 当成旧编号”，**不是**“跳过这个标题”：
 *    标题仍会正常编号，最终写成 "## 1 2002 的"。
 */
export const parseHeadingPrefix = (
    firstLine: string,
    level: number,
    oldDelimiter: string
): { oldNumber: string | null, textWithoutNumber: string } => {
    // 1. H4 专用：n、标题（顿号无空格）
    if (level === 4) {
        const h4Match = firstLine.match(/^(#{4})\s+(\d+)、(.+)$/)
        if (h4Match && !isNonNumberingNumber(h4Match[2])) {
            return { oldNumber: h4Match[2], textWithoutNumber: `${h4Match[1]} ${h4Match[3]}` }
        }
    }

    // 2. 标准层级编号 n / n.m / n.m.k
    const extracted = extractOldNumber(firstLine, oldDelimiter)
    if (extracted.number) {
        return { oldNumber: extracted.number, textWithoutNumber: extracted.textWithoutNumber }
    }

    // 3. 多段数字（历史遗留的杂乱编号）
    const multiMatch = firstLine.match(MULTI_NUMBER_PATTERN)
    if (multiMatch) {
        const hashTags = multiMatch[1]
        const restText = multiMatch[2]
        const numPartMatch = firstLine.match(new RegExp(`^${escapeForRegex(hashTags)}\\s+([0-9\\.\\-\\_\\s→]+)\\s+`))
        const numPart = numPartMatch ? numPartMatch[1].trim() : null
        if (numPart) {
            // 多位数字保护：首段是 3 位及以上数字时，它是正文而不是编号
            const firstToken = numPart.split(/[.\-_\s→]+/)[0]
            if (!isNonNumberingNumber(firstToken)) {
                return { oldNumber: numPart, textWithoutNumber: `${hashTags} ${restText}` }
            }
        }
    }

    // 4. 任意级别的 "n、标题"（从 H4 改成其他级别后残留的顿号格式）
    const dunhaoMatch = firstLine.match(/^(#{1,6})\s+(\d+)、(.+)$/)
    if (dunhaoMatch && !isNonNumberingNumber(dunhaoMatch[2])) {
        return { oldNumber: dunhaoMatch[2], textWithoutNumber: `${dunhaoMatch[1]} ${dunhaoMatch[3]}` }
    }

    // 5. 宽松数字回退
    const general = extractGeneralNumber(firstLine)
    if (general) {
        return {
            oldNumber: general,
            textWithoutNumber: firstLine.replace(
                new RegExp(`^(#{1,6})\\s+${escapeForRegex(general)}\\s+`), '$1 '
            )
        }
    }

    return { oldNumber: null, textWithoutNumber: firstLine }
}
