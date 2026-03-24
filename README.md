# Mission Control Kanban Widget

Mission Control is a Figma widget that turns key frames, sections, components, and instances into a lightweight kanban board on the canvas. It is designed as a file-level navigation layer for teammates who need to find the right design resource quickly without digging through every page.

## What It Does

- Track important nodes from anywhere in the file.
- Organize tracked items into customizable status columns.
- Jump to the source frame across pages in Design Mode.
- Copy a deep link for a tracked node when the file has a Figma file key.
- Refresh tracked items to sync names, page locations, and missing states.
- Flag deleted targets so stale cards are easy to spot.

## Current Workflow

1. Place the widget on the canvas.
2. Click `+ Add Frames`.
3. Select frames, sections, components, or instances in the file.
4. Click the confirm button in the widget header to add them.
5. Move cards between columns with the left and right arrow actions.
6. Use `Jump` to focus the source node.
7. Use `↻` to sync a single card, or `Refresh Status` from the property menu to sync the whole board.

## Important Behavior

- `Jump` works in Design Mode only.
- In Dev Mode / Inspect, the widget shows the reminder text but does not mimic native linked text layers.
- Cross-page navigation is supported by switching to the correct page before zooming to the node.
- If a file is unpublished and does not expose a file key, copy-link falls back to the raw node ID.

## Property Menu

- `Edit Columns`: rename, recolor, reorder, add, and delete columns.
- `Refresh Status`: resync all tracked items.
- `Clear All`: remove every tracked card from the board.

## Data Model

Each tracked item stores:

- Node ID
- Page ID and page name
- Current status
- Snapshot hash
- Created and last modified metadata
- Status history

All widget data is stored inside the Figma file through `useSyncedState`. No external service or network storage is used.

## Development

Install dependencies and build the widget bundle:

```bash
npm install
npm run build
```

For local iteration:

```bash
npm run watch
```

The compiled widget entry is `code.js`, generated from `code.tsx`.
