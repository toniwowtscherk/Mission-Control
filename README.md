# Mission Control Kanban Widget

**Version:** 4.1 (Dynamic Edition)  
**Type:** Figma Widget

---

## 1. Executive Summary
**Mission Control** is a visual project management widget that resides directly on the Figma canvas. It acts as the central hub for the file, organizing key frames into columns based on their lifecycle status.

Instead of a static list or individual sticky notes, users interact with a **Kanban Board**. This allows designers and developers to visualize the "Flow" of the project—seeing exactly which frames are in *Research*, which are *In Review*, and which are *Ready for Dev*—all while monitoring version health and external links from a single view.

---

## 2. Key Features

### 🎨 Fully Customizable Board (New in v4.1!)
The board adapts to your workflow, not the other way around.
*   **Dynamic Columns:** Add, remove, rename, and reorder columns to match your team's process.
*   **Advanced Color System:** Customize column headers with an advanced color picker. Choose from curated presets, input precise Hex codes, or use the visual spectrum picker.

### 🎯 The Registry
*   **Multi-Node Tracking:** Select frames on the canvas and click "Add Frames" to register them.
*   **Viewport Navigation:** Clicking a "Target" icon on any card immediately scrolls and zooms the Figma viewport to center that user flow.
*   **Orphan Detection:** If a tracked frame is deleted from the file, the widget flags the corresponding card as "🚫 Missing."

### 🛡️ "Health Check" & Monitoring
*   **Drift Detection:** The widget takes a snapshot (Hash) of frames when they are moved to a specific status.
*   **Visual Warnings:** If a frame marked "Ready for Dev" is modified after the fact, a **⚠️ Modified** badge appears, alerting developers that the design has drifted from the approved state.

### 🔗 Contextual Linking
*   **Copy Links:** Rapidly copy deep links to specific frames for sharing in Slack or Jira.
*   **External Integrations:** Adding text links to Jira, Linear, or GitHub in the card details (future) displays provider-specific icons.

---

## 3. Workflow & Interaction

### The Board View
The widget renders a horizontal Kanban layout.
*   **Drag-alternative:** Use the `<` and `>` arrows on cards to move items through the workflow.
*   **Quick Actions:** 
    *   **Jump:** Center view on frame.
    *   **Copy Link:** Grab the direct URL.
    *   **Sync:** Update the stored snapshot of the frame.

### Setup & Customization
1.  **Selection Mode:** Click "+ Add Frames" to enter a dedicated selection mode where you can click multiple frames on the canvas to batch-add them.
2.  **Edit Mode:** Click the **⚙️ Settings** icon (or property menu) to enter Edit Column mode.
    *   **Add:** Create new lifecycle stages.
    *   **Style:** Use the color picker to distinctively code your phases.
    *   **Sort:** Reorder columns with Up/Down controls.

---

## 4. Technical Details
*   **Persistence:** Uses `useSyncedState` to maintain board state across sessions and users.
*   **Performance:** Optimized rendering loop with smart buffering for selection changes.
*   **Privacy:** All data resides within the Figma file; no external database is used.
