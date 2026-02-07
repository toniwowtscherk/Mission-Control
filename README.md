# DesignLog Kanban Widget

A Figma widget that acts as Mission Control for your design files, organizing key frames into a Kanban board with lifecycle tracking.

## Features

- **🎯 Mission Control Registry**: Track and manage key frames from your Figma file
- **📊 Kanban Board**: Visualize frame lifecycle across 5 columns:
  - 🟣 Research
  - 🔵 Exploration
  - 🟠 In Review
  - 🟢 Ready for Dev
  - ⚫ Archived
- **🔍 Viewport Navigation**: Click to jump directly to any tracked frame
- **✅ Health Check**: Detect when frames have been modified after status changes
- **🚫 Orphan Detection**: Automatically flag deleted frames
- **🔗 External Links**: Support for Jira, Linear, GitHub, and other issue trackers
- **📜 History Tracking**: Full audit trail of status changes

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the widget:
```bash
npm run build
```

3. In Figma:
   - Go to Widgets → Development → Import widget from manifest
   - Select the `manifest.json` file from this directory

## Usage

### Adding Frames to the Board

1. Select a frame, component, or instance on your canvas
2. Right-click the widget and choose "Add Selected Frame"
3. The frame will appear in the Research column

### Moving Frames Between Columns

- Click the **→** button to move forward in the workflow
- Click the **←** button to move backward
- Each move creates a snapshot and history entry

### Navigating to Frames

Click the **🎯 Jump** button on any card to scroll and zoom the viewport to that frame.

### Health Checks

Click the **✓** button to verify if the frame has been modified since its last status change.

### Removing Cards

Click the **×** button to remove a frame from the board (does not delete the actual frame).

## Development

Watch mode for development:
```bash
npm run watch
```

## Architecture

The widget uses:
- `useSyncedState` for persistent data storage
- Frame hashing for change detection
- Property menu for frame addition
- Async node access for viewport navigation

## Version

4.0.0 - Kanban Mission Control
