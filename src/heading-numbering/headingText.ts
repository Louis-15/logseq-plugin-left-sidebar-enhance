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
 * 判断标题是否以年份开头
 *
 * 插件生成的编号最多两三位（顶级编号上限约 79），不可能出现 1900 以上的 4 位数，
 * 因此把 1900–2099 的 4 位数字一律视为正文里的年份。
 * 例如 "## 2023 年总结" 不能被改写成 "## 1 年总结"。
 */
export const isYearLeadingHeading = (content: string): boolean => {
    const firstLine = (content || '').split(/\r?\n/)[0] || ''
    return /^#{1,6}\s+(?:19|20)\d{2}(?:\s|、|$)/.test(firstLine)
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

    // 年份保护：不把 "2023 年总结" 的年份当编号剥掉
    if (isYearLeadingHeading(content)) return null

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
