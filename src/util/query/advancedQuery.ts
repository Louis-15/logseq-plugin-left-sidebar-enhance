import { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user"

// 执行 Datalog 查询的通用封装函数
const advancedQuery = async <T>(query: string, ...input: Array<any>): Promise<T | null> => {
  try {
    const result = await logseq.DB.datascriptQuery(query, ...input)
    return result?.flat() as T
  } catch (err) {
    console.warn("Query execution failed:", err)
    return null
  }
}

export const getPageUuid = async (pageName: string): Promise<PageEntity["uuid"] | null> => {
  const result = await advancedQuery<{ uuid: PageEntity["uuid"] }[]>(`
    [:find (pull ?p [:block/uuid])
     :in $ ?input
     :where
     [?p :block/name ?name]
     [(= ?name ?input)]
     [?p :block/uuid ?uuid]]
     `  , `"${pageName}"`)
  return result?.[0]?.uuid ?? null
}

export const getContentFromUuid = async (uuid: BlockEntity["uuid"]): Promise<BlockEntity["content"] | null> => {
  const result = await advancedQuery<{ content: BlockEntity["content"] }>(`
    [:find (pull ?p [:block/content])
     :where
     [?p :block/uuid ?uuid]
     [(str ?uuid) ?str]
     [(= ?str "${uuid}")]]
     ` )
  return result?.[0]?.content ?? null
}

export const getParentFromUuid = async (uuid: BlockEntity["uuid"]): Promise<BlockEntity["uuid"] | null> => {
  const result = await advancedQuery<{ parent: BlockEntity["parent"] }>(`
    [:find (pull ?p [{:block/parent [:block/uuid]}])
     :where
     [?p :block/uuid ?uuid]
     [(str ?uuid) ?str]
     [(= ?str "${uuid}")]]
     `)
  if (result?.[0]?.parent) {
    const parentUuid = result[0].parent.uuid
    return parentUuid
  }
  return null
}


// ==================== Markdown 版本专用函数 ====================

export const getCurrentPageForMd = async (): Promise<{ originalName: PageEntity["originalName"], uuid: PageEntity["uuid"] } | null> => {
  // Markdown 版本可通过 original-name 获取页面原始名称
  const result = await advancedQuery<{ "original-name": PageEntity["originalName"], uuid: PageEntity["uuid"] }[]>(`
      [:find (pull ?p [:block/original-name :block/uuid])
       :in $ ?current
       :where
       [?p :block/name ?name]
       [(= ?name ?current)]
       [?p :block/uuid ?uuid]
       [?p :block/original-name ?original-name]]
       `, ":current-page")
  if (result?.[0]) {
    const { "original-name": originalName, uuid } = result[0]
    return { originalName, uuid }
  }
  return null
}

export const getCurrentZoomForMd = async (): Promise<{ uuid: BlockEntity["uuid"], page: { originalName: PageEntity["originalName"], uuid: PageEntity["uuid"] } } | null> => {
  // Markdown 版本可通过 original-name 获取页面原始名称
  const result = await advancedQuery<{ uuid: BlockEntity["uuid"], page: { originalName: PageEntity["originalName"], uuid: PageEntity["uuid"] } }[]>(`
      [:find (pull ?b [:block/uuid {:block/page [:block/uuid :block/original-name]}])
       :in $ ?current
       :where
       [?b :block/uuid ?uuid]
       [(str ?uuid) ?str]
       [(= ?str ?current)]]
       ` , ":current-page")
  if (result?.[0] && result[0].page)
    return { uuid: result[0].uuid, page: { originalName: result[0].page["original-name"], uuid: result[0].page.uuid } }
  return null
}



// ==================== 数据库版本专用函数 ====================


export const zoomBlockWhenDb = async (uuid: BlockEntity["uuid"]): Promise<{ uuid: PageEntity["uuid"], title: string } | null> => {
  const result = await advancedQuery<{ uuid: PageEntity["uuid"], title: string }>(`
    [:find (pull ?p [{:block/page [:block/uuid :block/title]}])
     :where
     [?p :block/uuid ?uuid]
     [(str ?uuid) ?str]
     [(= ?str "${uuid}")]]
     ` )
  if (result)
    return result[0] ?
      { uuid: result[0].page.uuid, title: result[0].page.title }
      : null
  return null
}


// 当 :current-page 返回 :block/page 时，识别为缩放模式
export const CurrentCheckPageOrZoom = async (): Promise<{ check: "page" | "zoom", page?: { title: string, uuid: PageEntity["uuid"] } }> => {

  // 当 :current-page 返回 :block/title 时，识别为数据库模式且正在浏览页面
  const result = await advancedQuery<{ title: string, uuid: PageEntity["uuid"] }>(`
    [:find (pull ?p [:block/title :block/uuid])
     :in $ ?current
     :where
     [?p :block/title ?title]
     [?p :block/uuid ?uuid]
     [?p :block/name ?name]
     [(= ?name ?current)]]
     ` , ":current-page")
  if (result?.[0]?.title) // title 存在则识别为数据库图谱的页面
    return { check: "page", page: { title: result[0].title, uuid: result[0].uuid } }
  return { check: "zoom" } // :current-page 不存在时识别为缩放模式

}