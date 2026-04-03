
const PATTERNS = {
  WIKI_LINK: /\[\[|\]\]/g,
  MARKDOWN_LINK: /\[([^\]]+)\]\(([^\)]+)\)/g,
  MARKDOWN_IMAGE: /!\[[^\]]+\]\([^\)]+\)/g,
  PROPERTY_KEY: /([A-Z])/g
}

const removePattern = (content: string, pattern: RegExp, replacement: string = ''): string =>
  pattern.test(content) ?
    content.replaceAll(pattern, replacement)
    : content

export const removeMarkdownLink = (blockContent: string) => removePattern(blockContent, PATTERNS.WIKI_LINK)

export const removeMarkdownAliasLink = (blockContent: string) => removePattern(blockContent, PATTERNS.MARKDOWN_LINK, "$1")

export const replaceOverCharacters = (blockContent: string) =>
  blockContent.length > 140 ?
    `${blockContent.substring(0, 140)}...`
    : blockContent

export const removeMarkdownImage = (blockContent: string) => removePattern(blockContent, PATTERNS.MARKDOWN_IMAGE)

// export const removeProperties = async (tocBlocks: TocBlock[], i: number, blockContent: string): Promise<string> => {
//   const properties = tocBlocks[i].properties
//   if (!properties) return blockContent
//   const keys = Object.keys(properties)
//   for (let j = 0; j < keys.length; j++) {
//     let key = keys[j]
//     const values = properties[key]
//     // 将 backgroundColor 转为 background-color 格式
//     // 当键名中间出现大写字母时，转为小写并在前面加连字符
//     key = key.replace(/([A-Z])/g, "-$1").toLowerCase()
//     blockContent = blockContent.replace(`${key}:: ${values}`, "")
//     blockContent = blockContent.replace(`${key}::`, "")
//   }
//   return blockContent
// }

export const removeListWords = (blockContent: string, wordList: string): string =>
  wordList
    .split("\n")
    .filter(word => word !== "")
    .map(word => new RegExp(word, "g"))
    .reduce((content, pattern) =>
      content.replaceAll(pattern, ""), blockContent)
