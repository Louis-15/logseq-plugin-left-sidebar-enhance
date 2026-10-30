/**
 * 标题编号状态（块属性）模块
 *
 * 状态不再外挂在 JSON 里，而是写入块自身的属性：
 *
 *     numbering:: skip | skip-subtree | repeat | locked
 *
 * 相比旧的外挂白名单，这样做的好处：
 * 1. 状态跟着块走 —— 复制 / 粘贴 / 移动块时属性一起带过去，不再依赖 UUID
 * 2. 跨图谱、跨设备天然同步（属性本身就在 md 文件 / 数据库里）
 * 3. 用户可以用属性查询筛选，也可以手动修正
 *
 * 四种状态的语义见 docs/design/块属性编号状态方案.md
 */

/** 合法的编号状态值 */
export type NumberingState = 'skip' | 'skip-subtree' | 'repeat' | 'locked'

/** 块属性键（Logseq 内部统一按小写处理） */
export const NUMBERING_PROP = 'numbering'

/** 四个合法值，用于快速校验 */
const VALID_STATES: readonly string[] = ['skip', 'skip-subtree', 'repeat', 'locked']

/** 判断字符串是否为合法状态值 */
const isNumberingState = (value: string): value is NumberingState =>
    VALID_STATES.includes(value)

/**
 * 把属性原始值规范化为状态值
 *
 * Logseq 的块属性值形态不稳定：可能是字符串，可能是数组（多值属性），
 * 也可能被写成 [[skip]] 这样的页面引用形式，这里统一收敛。
 * 非法值一律返回 null（按“无状态”处理，绝不猜测用户意图）。
 */
const normalizeState = (raw: unknown): NumberingState | null => {
    // 多值属性只认第一个
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value === null || value === undefined) return null

    let text = String(value).trim().toLowerCase()
    // 去掉页面引用包裹：[[skip]] → skip
    text = text.replace(/^\[\[|\]\]$/g, '').trim()

    return isNumberingState(text) ? text : null
}

/**
 * 在 properties 对象里查找属性值
 *
 * 不同模式下属性键可能是 'numbering'、':numbering' 或 ':logseq.property/numbering'，
 * 因此按最后一段路径名做大小写无关匹配，避免被键名前缀差异坑到。
 */
const findPropertyValue = (
    properties: Record<string, unknown> | undefined,
    name: string
): unknown => {
    if (!properties) return undefined
    for (const key of Object.keys(properties)) {
        const tail = key.split('/').pop()
        if (!tail) continue
        if (tail.replace(/^:/, '').toLowerCase() === name) return properties[key]
    }
    return undefined
}

/**
 * 从块内容中解析属性（兜底路径）
 *
 * 标题块内容形如：
 *     ## 2.3 标题正文
 *     numbering:: skip
 *
 * 第一行是标题，绝不能被当成属性行，所以从第 2 行开始扫描。
 * 这条路径用于 properties 尚未回填（或某些模式不返回属性）的情况。
 */
const parseStateFromContent = (content: string | undefined): NumberingState | null => {
    if (!content) return null
    const lines = content.split(/\r?\n/)
    for (let i = 1; i < lines.length; i++) {
        const matched = lines[i].match(/^\s*numbering::\s*(.+?)\s*$/i)
        if (matched) return normalizeState(matched[1])
    }
    return null
}

/**
 * 同步解析块状态（编号主流程使用，零额外 API 调用）
 *
 * 优先读 getPageBlocksTree 返回的 properties（已被 findHeaders 透传到标题节点），
 * 读不到时回退到 content 里解析。
 *
 * @param properties 块树节点的 properties 字段
 * @param content 块原始内容（可选，作为兜底）
 */
export const parseNumberingState = (
    properties: Record<string, unknown> | undefined,
    content?: string
): NumberingState | null => {
    const fromProperties = normalizeState(findPropertyValue(properties, NUMBERING_PROP))
    if (fromProperties) return fromProperties
    return parseStateFromContent(content)
}

/**
 * 异步读取单个块的状态（右键菜单使用）
 * 块不存在或读取失败时返回 null，调用方按“无状态”处理
 */
export const getBlockNumberingState = async (blockUuid: string): Promise<NumberingState | null> => {
    try {
        const block = await logseq.Editor.getBlock(blockUuid)
        if (!block) return null
        return parseNumberingState(
            block.properties as Record<string, unknown> | undefined,
            block.content
        )
    } catch (e) {
        console.warn(`[LSE] 读取块 ${blockUuid} 的 numbering 属性失败:`, e)
        return null
    }
}

/**
 * 写入 / 清除块状态
 *
 * ⚠️ 顺序约束（重要）：写入属性会改变块内容，调用方必须在写入后重新读取块，
 * 再做任何 updateBlock 文本替换，否则会把刚写入的属性行一并覆盖掉。
 * 这里的错误会向上抛，避免出现“提示成功但实际没写进去”的假象。
 *
 * @param state 传 null 表示清除属性（恢复自动编号）
 */
export const setBlockNumberingState = async (
    blockUuid: string,
    state: NumberingState | null
): Promise<void> => {
    try {
        if (state === null) {
            await logseq.Editor.removeBlockProperty(blockUuid, NUMBERING_PROP)
        } else {
            await logseq.Editor.upsertBlockProperty(blockUuid, NUMBERING_PROP, state)
        }
    } catch (e) {
        console.error(`[LSE] 写入块 ${blockUuid} 的 numbering 属性失败:`, e)
        throw e
    }
}
