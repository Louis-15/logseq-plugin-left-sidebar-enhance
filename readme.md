# Logseq Plugin: Left-Sidebar Enhance

> A Logseq plugin that enhances the left sidebar with page outline (TOC), hierarchical heading numbering, auto-heading-level adjustment, mouse-over sidebar reveal, and more.

<div align="right">

[English](./readme.md) | [中文](./readme.zh-CN.md)

</div>

---

## Features

### 1. Page Outline (Table of Contents)

Automatically generates a table of contents in the left sidebar based on headings (`#` to `######`) in the current page.

- **Click** → Jump to heading position
- **Ctrl+Click** → Open as zoom page
- **Shift+Click** → Open in right sidebar
- **Hover highlight** → Hover over TOC item to highlight the corresponding block; focus a block to highlight its TOC entry
- **Journal support** → Shows date list for journal pages (toggleable in settings)

### 2. Hierarchical Heading Numbering (File-Based Graphs Only)

Manually add hierarchical numbers (e.g., `1`, `1.1`, `1.1.1`) to Markdown headings via a toolbar button — no background listeners, no performance impact.

- **Toolbar button** → Click "Renumber" to number the current page
- **Right-click menu** on block bullets (state is stored as a block property `numbering::`):
  - **Skip** (`skip`) — Exclude this heading from numbering; its children inherit the parent number prefix
  - **Skip subtree** (`skip-subtree`) — Exclude this heading and all of its descendants from numbering
  - **Lock** (`locked`) — Keep the current number unchanged; subsequent siblings increment from it
  - **Repeat** (`repeat`) — Use the same number as the previous sibling
- **State icons** → The block bullet turns into a state icon: skip ⊘, skip-subtree ⊘ (with inner ring), repeat ⧉, locked 🔒 (SVG line art that follows the theme text color)
- **Skip-subtree also cleans up** → After being marked, every renumber recursively removes existing numbers inside that subtree (blocks marked `locked` or `repeat` are preserved)
- **State follows the block** → Copy/move a block and its numbering state goes with it, across graphs
- **Multi-digit guard** → Leading numbers of 3+ digits (`100`–`9999`) are treated as text while the heading is still numbered (`## 2002 的` → `## 1 2002 的`)
- **Queryable** → Works with property queries such as `{{query (property numbering skip)}}`

> Want the same section to keep the same number across notes? See "Notes with a Specific Tag Follow a Preset Rule" below.

### 3. Notes with a Specific Tag Follow a Preset Rule (File-Based Graphs Only)

Notes carrying a specific **tag** can be numbered by a prewritten rule instead of simple sequential numbering from 1.

A rule is made of several **categories**, each owning a number prefix. Headings are assigned to a category by keyword and then incremented within it, so the same section keeps a stable number across different notes.

#### How numbering works

```
number = categoryId × 10 + indexWithinCategory
```

- The category id decides the prefix (`id: 2` → its headings start at `21`, `22`, …)
- Category 1 may use the "positional" method: the first heading matching another category's keyword becomes the divider, and every heading before it belongs to category 1 — so a variable number of leading headings never shifts later numbers
- Categories 2+ match by keyword; a heading matching nothing stays in the last matched category
- Child headings (H2–H4) still increment under the parent number (`21.1`, `21.1.2`), and H4 keeps the `n、title` format
- `subHeadings` can pin individual child sections to fixed numbers (nesting supported)

#### Trigger

Enabled when the page property (usually frontmatter) `tags` matches a rule's `tag`:

```yaml
---
tags: #your-rule-tag
---
```

- With multiple tags, page tags are checked in order and the **first matching rule wins**
- Pages matching no rule keep plain sequential numbering
- Like heading numbering, this only works on file-based graphs

#### Rule files

Rule files live in the **plugin installation folder** (not the graph folder, and not in this repository's source). The file name is the rule name:

```
{Logseq plugins dir}/left-sidebar-enhance/category-rules/{rule-name}.json
```

Minimal example (replace the placeholders as needed):

```json
{
  "tag": "your-rule-tag",
  "categories": [
    { "id": 1, "name": "leading", "positionBased": true },
    { "id": 2, "name": "section-two", "keywords": ["keywordA", "keywordB"] },
    {
      "id": 3,
      "name": "section-three",
      "keywords": ["keywordC"],
      "subHeadings": [
        { "number": 1, "keywords": ["childA"] }
      ]
    }
  ]
}
```

| Field | Description |
|---|---|
| `tag` | Tag name matched against page `tags` (without `#`) |
| `categories[].id` | Category id, decides the tens digit (`id: 2` → numbers start at 20) |
| `categories[].positionBased` | Marks the positional category; normally `id: 1` |
| `categories[].keywords` | Keywords; the heading matches if it contains any (case-insensitive, full/half-width spaces ignored) |
| `categories[].subHeadings[].number` | Fixed one-digit number, may be 0 (e.g. `30`) |
| `categories[].subHeadings[].keywords` | Child-section keywords; `subHeadings` may nest further |

#### Enabling it

List rule names (file name without `.json`), one per line, under the "Enabled Category Numbering Rules" setting:

```
{rule-name}
```

- Only listed rules are loaded; leaving it empty tries only `人设标签`
- A missing rule file or invalid JSON makes that rule be skipped (a warning is logged) and the page falls back to plain numbering
- Reload the plugin (or change any plugin setting once) after editing rule files
- The rule file must actually exist, otherwise pages with that tag get no preset-rule numbering

### 4. Auto-Adjust Heading Levels (File-Based Graphs Only)

Automatically normalizes Markdown heading levels based on the block tree's outline depth, ensuring a clean hierarchy. Works within the H1–H4 range.

- **Reserve H1** → Optionally reserve H1 for the page title
- **Commands** → Normalize headings on the current page or within a selection via the command palette (`Ctrl+Shift+P`, search "Normalize headings")

### 5. Mouse-Over Sidebar Reveal

When the left sidebar is hidden, move your mouse to the left edge to temporarily reveal it.

- **Type A** → Trigger by hovering near the top-left corner
- **Type B (Recommended)** → Trigger by hovering over the leftmost column of the window
- Toggle via the top-left `≡` button or plugin settings

### 6. Favorites & History Dedup

Automatically removes duplicate items between Favorites and History on startup and every 10 minutes.

---

## Installation

### Manual Installation (Recommended)

1. Download the latest `logseq-plugin-left-sidebar-enhance-*.zip` from the [Releases](https://github.com/Louis-15/logseq-plugin-left-sidebar-enhance/releases) page
2. Unzip it into a `left-sidebar-enhance` folder inside the Logseq plugins directory (place the archive contents directly in that folder, without an extra nesting level)
3. Reload the plugin in Logseq's "Settings → Plugins"

> This repository is a personally maintained version whose features have diverged significantly from upstream [YU000jp/logseq-plugin-left-sidebar-enhance](https://github.com/YU000jp/logseq-plugin-left-sidebar-enhance). The `Left-Sidebar Enhance` entry in the Logseq Marketplace is the upstream version and shares the same plugin id (`left-sidebar-enhance`), so do not install both.

---

## Usage

- **Page Outline** — Opens any page; the TOC appears automatically in the left sidebar
- **Heading Numbering** — Click the `[1 2 3]` icon in the page toolbar, or right-click a heading's block bullet for skip / skip-subtree / lock / repeat
- **Preset Rule Numbering** — Add the rule's tag to a page (e.g. `tags: #your-rule-tag`) to enable it; rule files live in `category-rules/` inside the plugin folder
- **Auto-Adjust Levels** — Use the command palette (`Ctrl+Shift+P`) and search for "Normalize headings on current page" or "Normalize headings in selection"
- **Mouse-Over** — Click the `≡` button in the top-left corner to toggle between hidden and mouse-over modes

---

## Plugin Settings

| Setting | Description |
|---------|-------------|
| Hide Duplicates in Favorites & History | Auto-deduplicate on startup and every 10 min |
| Mouse-Over Reveal | Enable/disable, select Type A or Type B |
| Page Outline (TOC) | Enable/disable, highlight on hover, journal date list |
| Heading Numbering | Button-triggered; configure via the block right-click menu (skip / skip-subtree / lock / repeat) |
| Enabled Category Numbering Rules | One rule name per line, mapping to `category-rules/{rule}.json` in the plugin folder |
| Auto-Adjust Heading Levels | Enable/disable, reserve H1 (range fixed to H1–H4) |

---

## Data Storage

Heading states (skip / skip-subtree / lock / repeat) are stored as a **native Logseq block property** on the block itself:

```
## 2.3 Heading text
numbering:: skip
```

- Property key is `numbering`; valid values are `skip`, `skip-subtree`, `repeat`, `locked`
- State travels with the block when moved or copied, and syncs across graphs — no UUID index required
- The plugin hides the property in the block property panel. To hide it **even in edit mode**, add this to `config.edn`:

```clojure
:block-hidden-properties #{:numbering}
```

> Older versions used a JSON file under `assets/storages/left-sidebar-enhance/`. It is no longer read and can be deleted safely. **States are not migrated automatically** — re-mark blocks after upgrading.

---

## License

MIT
