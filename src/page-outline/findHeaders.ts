import { isHeader, getHeaderLevel } from "./regex"
import { Child, TocBlock } from "./pageHeaders"


/**
 * 带层级信息的扩展 TocBlock
 */
export interface HierarchicalTocBlock extends TocBlock {
  level: number  // Heading level (1-6)
  children?: HierarchicalTocBlock[]  // Child headings
  parent?: HierarchicalTocBlock  // Parent heading (for traversal)
}


// Markdown 模式用：从块树中提取标题
export const getTocBlocks = (childrenArr: Child[]): TocBlock[] => {
  return findHeaders(childrenArr, (child) => isHeader(child.content, child as TocBlock, true))
}


// 数据库模式用：从块树中提取标题
export const getTocBlocksForDb = (childrenArr: Child[]): TocBlock[] => {
  return findHeaders(childrenArr, (child) => child[":logseq.property/heading"] === 1 ||
    child[":logseq.property/heading"] === 2 ||
    child[":logseq.property/heading"] === 3 ||
    child[":logseq.property/heading"] === 4 ||
    child[":logseq.property/heading"] === 5 ||
    child[":logseq.property/heading"] === 6
  )
}


/**
 * 获取带层级结构的标题列表
 * Markdown 模式用
 */
export const getHierarchicalTocBlocks = (childrenArr: Child[]): HierarchicalTocBlock[] => {
  return buildHierarchicalHeaders(
    childrenArr,
    (child) => isHeader(child.content, child as TocBlock, true),
    (child) => getHeaderLevel(child.content)
  )
}


/**
 * 获取带层级结构的标题列表
 * 数据库模式用
 */
export const getHierarchicalTocBlocksForDb = (childrenArr: Child[]): HierarchicalTocBlock[] => {
  return buildHierarchicalHeaders(
    childrenArr,
    (child) => (child[":logseq.property/heading"] || 0) >= 1 && (child[":logseq.property/heading"] || 0) <= 6,
    (child) => child[":logseq.property/heading"] as number || 0
  )
}


/**
 * 通用标题提取函数（返回扁平列表，兼容旧版）
 */
const findHeaders = (childrenArr: Child[], isHeaderFn: (child: Child) => boolean): TocBlock[] => {
  let tocBlocks: TocBlock[] = []

  const findAllHeaders = (childrenArr: Child[]) => {
    if (!childrenArr) return
    for (let child of childrenArr) {
      if (isHeaderFn(child)) {
        tocBlocks.push({
          content: child.content,
          uuid: child.uuid,
          properties: child.properties,
          [":logseq.property/heading"]: child[":logseq.property/heading"],
        })
      }
      if (child.children) findAllHeaders(child.children)
    }
  }

  findAllHeaders(childrenArr)
  return tocBlocks
}


/**
 * 构建层级标题树结构
 * 根据标题等级将标题组织成嵌套树结构
 */
const buildHierarchicalHeaders = (
  childrenArr: Child[],
  isHeaderFn: (child: Child) => boolean,
  getLevelFn: (child: Child) => number
): HierarchicalTocBlock[] => {
  const rootHeaders: HierarchicalTocBlock[] = []
  const stack: HierarchicalTocBlock[] = []  // Stack to track current hierarchy path

  const processHeaders = (childrenArr: Child[]) => {
    if (!childrenArr) return

    for (let child of childrenArr) {
      if (isHeaderFn(child)) {
        const level = getLevelFn(child)
        
        const headerBlock: HierarchicalTocBlock = {
          content: child.content,
          uuid: child.uuid,
          properties: child.properties,
          [":logseq.property/heading"]: child[":logseq.property/heading"],
          level,
          children: []
        }

        // Find the appropriate parent based on level
        // Pop from stack until we find a parent with lower level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }

        if (stack.length === 0) {
          // This is a root-level header
          rootHeaders.push(headerBlock)
        } else {
          // This is a child of the last header in stack
          const parent = stack[stack.length - 1]
          headerBlock.parent = parent
          if (!parent.children) {
            parent.children = []
          }
          parent.children.push(headerBlock)
        }

        // Add this header to the stack
        stack.push(headerBlock)
      }

      // Process children blocks recursively
      if (child.children) {
        processHeaders(child.children)
      }
    }
  }

  processHeaders(childrenArr)
  return rootHeaders
}


/**
 * 将层级标题树展平为简单列表（用于向后兼容）
 */
export const flattenHierarchicalHeaders = (hierarchicalHeaders: HierarchicalTocBlock[]): TocBlock[] => {
  const flat: TocBlock[] = []
  
  const flatten = (headers: HierarchicalTocBlock[]) => {
    for (const header of headers) {
      flat.push({
        content: header.content,
        uuid: header.uuid,
        properties: header.properties,
        [":logseq.property/heading"]: header[":logseq.property/heading"],
      })
      if (header.children && header.children.length > 0) {
        flatten(header.children)
      }
    }
  }
  
  flatten(hierarchicalHeaders)
  return flat
}
