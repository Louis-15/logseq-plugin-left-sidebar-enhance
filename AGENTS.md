# AGENTS.md

面向接手本仓库的 AI / 人类协作者。

这是 Logseq 插件（TypeScript + Vite）。核心能力：侧边栏大纲、标题层级编号（状态存于块属性）、按 Tag 预设规则编号、自动标题等级、悬停唤出侧栏、收藏夹去重。

事实来源优先级：**代码 > 本文件 > `docs/design/`**。`docs/design/` 是历史设计记录，部分已过时（见「已知问题」）。

---

## 工作流程

### 1. 定位改动点

先看下面的「模块地图」，再读该模块顶部的注释。

**完成标准**：能说清这次改动经过哪个函数、影响哪些文件。

### 2. 改代码

遵守「不变量」。新逻辑优先放进子模块，而不是继续扩写大文件——行级文本解析放 [`headingText.ts`](src/heading-numbering/headingText.ts)，块圆点相关放 [`bulletBadges.ts`](src/heading-numbering/bulletBadges.ts)，这两个文件就是为此拆出来的。

**完成标准**：改动集中在必要文件内，未触碰无关模块。

### 3. 静态校验

```powershell
npx tsc --noEmit
```

`strict` 已开启。仓库**没有单元测试**，不要去找测试命令，也不要为了小改动新建测试框架。

**完成标准**：零类型错误。

### 4. 构建

```powershell
npm run build   # = tsc && vite build --mode=dev
```

产物在 `dist/`，文件名带 hash。`dist/` 被 `.gitignore` 忽略，不要手工编辑 `dist/` 里的任何文件。

**完成标准**：构建成功，`dist/index.html` 引用了新的 hashed js。

### 5. 部署到本机 Logseq

**整体替换**安装目录的 `dist`（先删除旧目录，否则会残留旧 hash 文件），并同步改动过的顶层文件（`package.json`、`readme*`）：

| | 路径 |
|---|---|
| 源码 | `D:\Projects\logseq-plugin-left-sidebar-enhance` |
| 本机安装目录 | `C:\Users\aaa\.logseq\plugins\left-sidebar-enhance` |

部署后**提示用户在 Logseq 里重载插件**——Logseq 会缓存旧 bundle，不重载看不到任何改动。

**完成标准**：安装目录 `dist/index.html` 指向的 js 存在，且与仓库 `dist` 的哈希一致。

### 6. 发布（仅在用户明确要求时）

顺序：改 `package.json` 的 `version` → 重新构建 → 打包 zip → 提交 → 推送 `main` → 打 tag `vX.Y.Z` → 建 Release 并上传资产。

zip 内容：`dist/`、`package.json`、`icon.png`、`LICENSE`、`readme.md`、`readme.zh-CN.md`、`category-rules/`（**必须从安装目录取，仓库里没有这个目录**）。

仓库没有 CI、没有 `gh` CLI；用 `git` + GitHub REST API 完成（凭据可从 `git credential fill` 取得）。

**完成标准**：Release 页出现对应 tag 与 zip 资产，且 `dist/` 是发布前重新构建的。

---

## 模块地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 入口、启动顺序、全局页面状态（`getCurrentPageOriginalName` / `getCurrentPageUuid` / `booleanLogseqVersionMd`） |
| [`src/page-outline/`](src/page-outline) | 侧边栏大纲：路由检测、标题树提取、DOM 渲染、缩放/日记列表 |
| [`src/heading-numbering/index.ts`](src/heading-numbering/index.ts) | 编号引擎：`applyHeadingNumbersToPage` → 区间分类 → `updateHierarchicalBlocks` → `processSiblings` |
| [`src/heading-numbering/blockStates.ts`](src/heading-numbering/blockStates.ts) | 块属性 `numbering::` 的读写与值归一化 |
| [`src/heading-numbering/headingText.ts`](src/heading-numbering/headingText.ts) | 行级文本规则：是否标题、多位数字保护、旧编号前缀解析、编号剥离 |
| [`src/heading-numbering/bulletBadges.ts`](src/heading-numbering/bulletBadges.ts) | 圆点状态图标（SVG mask）+ 右键事件改派 |
| [`src/heading-numbering/headingButtons.ts`](src/heading-numbering/headingButtons.ts) | 块右键菜单 4 项（跳过 / 跳过整棵子树 / 重复上一个 / 锁定） |
| [`src/heading-numbering/categoryRules.ts`](src/heading-numbering/categoryRules.ts) | 按 Tag 加载规则文件、H1 区间分类 |
| [`src/heading-numbering/toolbarIcon.ts`](src/heading-numbering/toolbarIcon.ts) | 工具栏「重新编号」按钮 |
| [`src/auto-heading-level/`](src/auto-heading-level) | 按块树深度规整 H1–H4 |
| [`src/settings/`](src/settings) | 设置模板（`settingsTemplate`）与**唯一的**设置变更分发器 |
| [`src/translations/`](src/translations) | 19 种语言；编号相关的新文案**尚未接入** i18n |

页面切换链路：`routeCheck` → `onPageChangedCallback` → `refreshPageHeaders` + `updateToolbarIcon` + `refreshPageBulletBadges`。

---

## 编号数据模型

状态写入块属性 `numbering::`，四个合法值：

| 值 | 语义 | 子标题 |
|---|---|---|
| `skip` | 自身不编号、不占序号 | 继续编号 |
| `skip-subtree` | 自身与其后整棵子树不编号；每次编号递归清理子树内旧编号（保留 `locked` / `repeat`） | 不编号 |
| `repeat` | 复用上一个同级编号 | 正常递归 |
| `locked` | 文本不动，提取其编号供后续兄弟递增 | 正常递归 |

编号格式：

- 普通模式：`## 2.3 标题`；H4 特例 `#### 3、标题`（顿号、无空格）
- 区间模式（页面 tag 命中规则）：H1 = `区间ID × 10 + 区间内序号`，统一补足两位（区间 0 → 01、02；区间 2 → 21、22）；区间 1 兼作兜底区间，`特征`/`组合的化学反应` 固定 11，未命中任何关键词的 H1 也归它并顺序递增；H2–H4 在父编号下递增
- H5 及更深层级整棵跳过

多位数字保护：标题开头 **3 位及以上数字**（100 起）视为正文，标题照常编号（`## 2002 的` → `## 1 2002 的`）。判定必须集中在 [`headingText.ts`](src/heading-numbering/headingText.ts) 内，不要另写一套正则。

---

## 不变量

每条都对应一个踩过的坑。改动前先确认没有违反。

1. **块内容保真**：`logseq.Editor.updateBlock` 是整体替换。只改第一行，保留其余行——`numbering::` 属性行就在其余行里。

2. **先写属性，再改文本**：写入属性后必须重新 `getBlock` 取最新 `content` 再替换文本，否则用旧内容会把刚写入的属性冲掉。

3. **状态从数据读，不从 DOM 读**：`numbering` 属性通常已被 `config.edn` 全局隐藏（本机：`C:\Users\aaa\.logseq\config\config.edn` 的 `:block-hidden-properties #{:numbering}`），DOM 里根本不存在。DOM 上只有 `data-lse-num`，它来自内存缓存。

4. **圆点尺寸用百分比**：`.bullet-container` 是固定的 16px，用 `em` 会随正文字号撑破容器。图标路径用 `headingText.ts` 提供的规则，不要复制。

5. **保留悬停高光，只清选中边框**：Logseq 的 `.bullet-link-wrap:hover > .bullet-container` 背景是原生高光，必须保留；需要清掉的是 `.bullet.selected { border: 3px solid }`（无颜色 → `currentColor` → 深色主题下是白框）。覆盖 Logseq 带 `!important` 的规则时，选择器特异性要到 `(0,6,0)` 级别。

6. **右键改派不可移除**：Logseq 有两套块右键菜单——含插件项的 `block-context-menu-content`，和不含插件项的 `custom-context-menu-content`。完整菜单那一支会创建选区，导致后续右键落到阉割版。修复依赖 [`bulletBadges.ts`](src/heading-numbering/bulletBadges.ts) 在捕获阶段把事件改派给 `.bullet`，且**判定必须用块 uuid + 内存缓存**（选区创建后块会重渲染，`data-lse-num` 有段时间是空的）。

7. **规则文件只在安装目录**：`{安装目录}/category-rules/{规则名}.json`，代码用 `fetch('../category-rules/...')`（相对 `dist/index.html`）。仓库里没有该目录，首次克隆后需要在安装目录维护；改规则后要重载插件或触发一次设置变更（规则有缓存）。

8. **纯按钮触发**：编号只由工具栏按钮或右键菜单触发。不要新增 `logseq.DB.onChanged`、定时轮询或 DOM 高频扫描——历史上正是这些导致卡顿，重构方案见 `docs/design/纯按钮触发重构方案.md`。

9. **编号仅文件型图谱**：`isFileBasedGraph` 在启动时检测一次；数据库模式（0.11+）只支持大纲，不支持编号。

10. **设置变更走中央分发器**：[`src/settings/onSettingsChanged.ts`](src/settings/onSettingsChanged.ts) 是唯一监听点，新模块在那里注册处理函数，不要各自调 `logseq.onSettingsChanged`。

11. **文件编码与注释**：UTF-8 无 BOM；注释用中文，复杂分支要说明「为什么」而不是复述代码。改文件用编辑工具，不要用 shell 重定向覆盖源码（容易改编码）。

12. **循环导入**：`src/index.ts` ↔ `heading-numbering/index.ts` 互相引用（后者取 `booleanLogseqVersionMd`），运行时可用但脆弱。新增对入口的依赖前先考虑把共享状态移出。

13. **发版要用户明确指令**：「代码改完 + 验证通过」就是终点，不要自行打 tag / push / 改版本号。

---

## 已知问题

| 问题 | 位置 | 说明 |
|---|---|---|
| 区间规则默认兜底失效 | `categoryRules.ts` → `getRuleMap` | 启动时 `loadAllCategoryRules` 已把 `ruleCache` 设为空 Map，`ruleCache === null` 的兜底分支进不去。规则文件缺失时该 tag 完全不会启用区间编号 |
| 单文件超红线 | `heading-numbering/index.ts`（约 650 行） | 超过 600 行红线。`processSiblings` 内 `repeat` / 固定子标题 / 自动编号三支仍有历史重复的文本替换逻辑 |
| 未使用的导出/文件 | `index.ts` 的 `isPageActive`、`cleanupPageHeadingNumbers`、`getBlockHeadingState`、`page-outline/findHeaders.ts` 的 `flattenHierarchicalHeaders`、`heading-numbering/headingButtons.css` | 清理前先确认没有动态引用 |
| TOC 观察器累积 | `page-outline/headerItem.ts` | 每个大纲项各注册一个 `MutationObserver` 观察整个正文容器，回调里重复 `addEventListener`，长时间使用可能累积 |
| 编号文案未国际化 | `headingButtons.ts`、`toolbarIcon.ts` | 菜单与提示是硬编码中文，未接入 `translations/` |
| 设计文档过时 | `docs/design/区间分类自动编号方案.md` | 仍描述用 SandboxStorage 存规则，实际已改为 `category-rules/*.json` |

---

## 快速定位

| 现象 | 先看 |
|---|---|
| 点了按钮没编号 | `index.ts` 的 `isFileBasedGraph` 是否 false；`applyHeadingNumbersToPage` 是否提前 return |
| 编号重复叠加（`1 1 标题`） | `headingText.ts` 的 `parseHeadingPrefix` / `extractOldNumber` |
| 年份被吞（`2002` 消失） | 多位数字保护是否覆盖了所有匹配路径 |
| 属性行消失 | 是否违反「先写属性，再改文本」，或用旧 `content` 调了 `updateBlock` |
| 圆点图标不显示/错位 | `data-lse-num` 是否挂上（缓存为空？）；容器尺寸是否被 `em` 撑破 |
| 右键菜单偶发缺 4 项 | 捕获阶段改派是否生效；缓存里是否有该页 uuid |
| 圆点出现白框/白圈 | 是否又覆盖了 `.bullet.selected` 的 `border` 或误删了悬停高光 |
| 区间编号不生效 | 页面 tag 是否命中规则 `tag`；规则文件是否存在；插件是否重载过 |

---

## 参考

- 用户文档：[`readme.md`](readme.md)、[`readme.zh-CN.md`](readme.zh-CN.md) — 改功能要同步这两份
- 设计记录：[`docs/design/`](docs/design) — 解释「为什么这样设计」，但以代码为准
- Logseq 插件 API：`@logseq/libs`（`node_modules/@logseq/libs/dist/LSPlugin.d.ts`）
- 本机 Logseq 版本：`0.10.15`（文件型图谱）。版本检测区分 0.10.x（Markdown）与 0.11+（数据库）
