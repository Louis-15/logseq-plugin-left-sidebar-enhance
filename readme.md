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
- **State follows the block** → Copy/move a block and its numbering state goes with it, across graphs
- **Multi-digit guard** → Leading numbers of 3+ digits (`100`–`9999`) are treated as text while the heading is still numbered (`## 2002 的` → `## 1 2002 的`)
- **Queryable** → Works with property queries such as `{{query (property numbering skip)}}`

### 3. Auto-Adjust Heading Levels (File-Based Graphs Only)

Automatically normalizes Markdown heading levels based on the block tree's outline depth, ensuring a clean hierarchy. Works within the H1–H4 range.

- **Reserve H1** → Optionally reserve H1 for the page title
- **Commands** → Normalize headings on the current page or within a selection via the command palette (`Ctrl+Shift+P`, search "Normalize headings")

### 4. Mouse-Over Sidebar Reveal

When the left sidebar is hidden, move your mouse to the left edge to temporarily reveal it.

- **Type A** → Trigger by hovering near the top-left corner
- **Type B (Recommended)** → Trigger by hovering over the leftmost column of the window
- Toggle via the top-left `≡` button or plugin settings

### 5. Favorites & History Dedup

Automatically removes duplicate items between Favorites and History on startup and every 10 minutes.

---

## Installation

### Via Logseq Marketplace

1. Click the `•••` button on the toolbar and select `Plugins`
2. Switch to the **Marketplace** tab
3. Search for `Left-Sidebar Enhance` and install

### Manual Installation

1. Download the latest release from the [Releases](https://github.com/YU000jp/logseq-plugin-left-sidebar-enhance/releases) page
2. Unzip into the Logseq plugins directory
3. Enable the plugin in Logseq's plugin manager

---

## Usage

- **Page Outline** — Opens any page; the TOC appears automatically in the left sidebar
- **Heading Numbering** — Click the `[1 2 3]` icon in the page toolbar, or right-click a heading's block bullet for skip / skip-subtree / lock / repeat
- **Auto-Adjust Levels** — Use the command palette (`Ctrl+Shift+P`) and search for "Normalize headings on current page" or "Normalize headings in selection"
- **Mouse-Over** — Click the `≡` button in the top-left corner to toggle between hidden and mouse-over modes

---

## Plugin Settings

| Setting | Description |
|---------|-------------|
| Hide Duplicates in Favorites & History | Auto-deduplicate on startup and every 10 min |
| Mouse-Over Reveal | Enable/disable, select Type A or Type B |
| Page Outline (TOC) | Enable/disable, highlight on hover, journal date list |
| Heading Numbering | Button-triggered; configure via right-click menu on headings |
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

> Older versions used a JSON file under `assets/storages/left-sidebar-enhance/`. It is no longer read; you may delete it safely.

---

## License

MIT
