const { widget } = figma;
const { 
  AutoLayout, 
  Text,
  Input,
  useSyncedState, 
  usePropertyMenu,
  useEffect,
  h
} = widget;

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_COLUMNS = [
  { id: 'RESEARCH', label: '🟣 Research', color: '#9333EA', bgColor: '#F3E8FF' },
  { id: 'EXPLORATION', label: '🔵 Exploration', color: '#2563EB', bgColor: '#DBEAFE' },
  { id: 'IN_REVIEW', label: '🟠 In Review', color: '#EA580C', bgColor: '#FFEDD5' },
  { id: 'READY_FOR_DEV', label: '🟢 Ready for Dev', color: '#16A34A', bgColor: '#DCFCE7' },
  { id: 'ARCHIVED', label: '⚫ Archived', color: '#6B7280', bgColor: '#F3F4F6' }
];

// UI Constants
const SHADOW_COLOR = { r: 0, g: 0, b: 0, a: 0.1 };
const SHADOW_OFFSET = { x: 0, y: 2 };
const SHADOW_EFFECT = {
  type: 'drop-shadow',
  color: SHADOW_COLOR,
  offset: SHADOW_OFFSET,
  blur: 8
};

const HEADER_PADDING = { bottom: 16 };

const CARD_SHADOW_COLOR = { r: 0, g: 0, b: 0, a: 0.05 };
const CARD_SHADOW_OFFSET = { x: 0, y: 1 };
const CARD_SHADOW_EFFECT = {
  type: 'drop-shadow',
  color: CARD_SHADOW_COLOR,
  offset: CARD_SHADOW_OFFSET,
  blur: 3
};

const BUTTON_PADDING = { vertical: 4, horizontal: 8 };
const BUTTON_HOVER = { fill: "#E5E7EB" };
const REMOVE_HOVER = { fill: "#FECACA" };

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateFrameHash(node) {
  // Create a simple hash based on node properties
  const hashData = JSON.stringify({
    type: node.type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    // Add more properties as needed for more granular tracking
  });
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashData.length; i++) {
    const char = hashData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function generatePastelColor(hex) {
    if (!hex || hex.length < 7) return '#F3F4F6';
    
    // Remove hash
    hex = hex.replace('#', '');
    
    // Parse
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Mix with white (90% white)
    const factor = 0.9;
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    
    // Return hex
    const toHex = (c) => {
        const h = c.toString(16);
        return h.length === 1 ? '0' + h : h;
    };
    
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

function detectLinkProvider(url) {
  if (url.includes('jira')) return '🔵';
  if (url.includes('linear')) return '◆';
  if (url.includes('github')) return '🐙';
  if (url.includes('gitlab')) return '🦊';
  return '🔗';
}

async function getNodeById(nodeId) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    return node;
  } catch (e) {
    return null;
  }
}

// ============================================
// MAIN WIDGET COMPONENT
// ============================================

// Global resolver to properly terminate the long-running interaction promise
let resolveScanningPromise = null;
// Keep track of the scanner function reference so we can remove it cleanly
let globalSelectionHandler = null;
// Keep track of scanned nodes globally to avoid re-render data loss
let globalScannedNodes = [];

function DesignLogKanban() {
  const [items, setItems] = useSyncedState('items', []);
  const [selectedCard, setSelectedCard] = useSyncedState('selectedCard', null);
  const [refreshKey, setRefreshKey] = useSyncedState('refreshKey', 0);
  
  // Column State
  const [columns, setColumns] = useSyncedState('columns', DEFAULT_COLUMNS);
  const [isEditingColumns, setIsEditingColumns] = useSyncedState('isEditingColumns', false);
  
  // Selection Mode State
  const [isScanning, setIsScanning] = useSyncedState('isScanning', false);
  const [scanCount, setScanCount] = useSyncedState('scanCount', 0);
  const [scannedIds, setScannedIds] = useSyncedState('scannedIds', []);

  // Property menu for adding frames
  usePropertyMenu(
    [
      {
        itemType: 'action',
        tooltip: 'Edit Columns',
        propertyName: 'editColumns',
      },
      {
        itemType: 'separator',
      },
      {
        itemType: 'action',
        tooltip: 'Refresh Status',
        propertyName: 'refresh',
      },
      {
        itemType: 'separator',
      },
      {
        itemType: 'action',
        tooltip: 'Clear All',
        propertyName: 'clearAll',
      }
    ],
    async ({ propertyName }) => {
      if (propertyName === 'editColumns') {
        setIsEditingColumns(!isEditingColumns);
      } else if (propertyName === 'refresh') {
        setRefreshKey(refreshKey + 1);
      } else if (propertyName === 'clearAll') {
        setItems([]);
        setScanCount(0);
        setIsScanning(false);
      }
    }
  );

  // Health check on load
  useEffect(() => {
    // Only verify health, do not reset interaction state automatically
    // as it creates conflicts with active selection modes during re-renders.
    
    // NOTE: We only want to run health check on explicit request or very rarely.
    // Running it on every render causes massive performance issues and loop crashes.
    // We will rely on manual Refresh via property menu for now.
    
    // checkFrameHealth(); // DISABLED AUTOMATIC CHECK TO PREVENT CRASHES
  });

  async function startScanning() {
    // If a previous scanning promise exists, resolve it first to clean up
    if (resolveScanningPromise) {
      resolveScanningPromise();
      resolveScanningPromise = null;
    }

    // We do NOT return a blocking Promise here anymore.
    // The "eternal loading" was caused by the widget waiting for this handler to finish.
    // We rely on figma.showUI to keep the process alive in the background.

    // Safety: Close any existing UI to prevent "Cannot create two CppVm objects" error
    if (figma.ui) {
      try { figma.ui.close(); } catch(e) {}
    }

    setIsScanning(true);
    setScanCount(0);
    globalScannedNodes = [];
    
    // Notify user immediately
    figma.notify("Selection Mode Active: Select frames on canvas to add them...", { timeout: 2000 });

    const checkSelection = () => {
       // Safety: Ensure figma.currentPage exists and is accessible
       if (!figma.currentPage) return;

       const selection = figma.currentPage.selection;
       
       // If the selection is ONLY the widget, we ignore it
       if (selection.length === 1 && selection[0].type === 'WIDGET') {
          return;
       }

       const validNodes = selection.filter(node => 
         ['FRAME', 'SECTION', 'COMPONENT', 'INSTANCE'].includes(node.type)
       );
       
       globalScannedNodes = validNodes;
       
       const count = validNodes.length;
       setScanCount(count);
       setScannedIds(validNodes.map(n => n.id));
    };

    // Store reference globally so we can remove it later
    globalSelectionHandler = checkSelection;

    // Check immediately & subscribe
    checkSelection();
    figma.on('selectionchange', checkSelection);

    try {
      figma.showUI(`
        <script>
          window.onmessage = (event) => {
            if (event.data && event.data.pluginMessage && event.data.pluginMessage.type === 'close') {
              window.close();
            }
          }
        </script>
      `, { visible: false, title: "Mission Control Scanner" });
    } catch (err) {
      console.error("Failed to show UI:", err);
    }
    
    // VITAL: Return a resolved Promise so the runtime knows this interaction handler is "done" setting up.
    // The background process (UI) continues, but the click handler itself must return.
    return Promise.resolve();
  }

  async function confirmAddItems() {
    try {
        // Reconstruct nodes from ID state to ensure persistence across renders/clicks
        const currentScannedIds = scannedIds || [];
        let validNodes = [];
        
        // First try filtering out IDs from global buffer if it matches
        // Caution: globalScannedNodes might be stale if re-render happened
        if (globalScannedNodes && globalScannedNodes.length > 0) {
          validNodes = globalScannedNodes;
        } 
        
        // Fallback: If global buffer is empty (due to re-render), fetch by ID
        if (validNodes.length === 0 && currentScannedIds.length > 0) {
          // Use sync lookup for safety in standard environment
          validNodes = currentScannedIds
            .map(id => figma.getNodeById(id))
            .filter(n => n !== null);
        }

        // Just in case we missed them in the first pass
        if (validNodes.length === 0) {
           figma.notify("No items selected (Selection might have been lost). Try again.");
           stopScanning();
           return Promise.resolve();
        }

        let userName = 'Unknown';
        try {
            if (figma.currentUser) {
                userName = figma.currentUser.name;
            }
        } catch (e) {
            console.error("Permission error accessing currentUser", e);
        }

        const timestamp = Date.now();
        const newItems = [];
        
        let addedCount = 0;
        let duplicateCount = 0;

        for (const node of validNodes) {
           // Double check node still exists safely
           if (!node || !node.id) continue;
           
           const isTracked = items.some(item => item.nodeId === node.id) || newItems.some(i => i.nodeId === node.id);
           
           if (isTracked) {
             duplicateCount++;
             continue;
           }

           // Safe hash generation
           let hash = "hash-error"; 
           try { hash = generateFrameHash(node); } catch(e) { console.error("Hash error", e); }

           const newItem = {
             id: `item-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
             nodeId: node.id,
             name: node.name || "Untitled",
             status: 'RESEARCH',
             snapshot: hash,
             addedBy: userName,
             addedAt: timestamp,
             lastModifiedBy: userName,
             lastModifiedAt: timestamp,
             history: [{
               from: null,
               to: 'RESEARCH',
               by: userName,
               at: timestamp,
               snapshot: hash
             }]
           };
           newItems.push(newItem);
           addedCount++;
        }

        if (newItems.length > 0) {
          setItems(items.concat(newItems));
        }

        if (addedCount > 0) {
          figma.notify(`Added ${addedCount} item${addedCount !== 1 ? 's' : ''}`);
        } else if (duplicateCount > 0) {
           figma.notify(`All selected items are already tracked.`);
        } else {
           figma.notify("No valid items selected.");
        }

        stopScanning();
        // Return a simple value, not a Promise, to signify completion to Figma's sync handler expectation
        return Promise.resolve();
    } catch (err) {
        console.error("Confirm Error", err);
        figma.notify("Error adding items: " + err.toString());
        stopScanning();
        return Promise.resolve(); // Graceful exit
    }
  }

  const stopScanning = () => {
    // 1. Remove the listener using the global reference
    if (globalSelectionHandler) {
       figma.off('selectionchange', globalSelectionHandler);
       globalSelectionHandler = null;
    }

    // 2. Hide/Close the invisible UI
    if (figma.ui) {
      try { figma.ui.hide(); } catch(e) {}
      try { figma.ui.close(); } catch(e) {}
    }
    
    // 3. Reset state
    setIsScanning(false);
    setScanCount(0);
    setScannedIds([]);
    globalScannedNodes = [];

    // 4. Resolve the promise if it exists (for safety, though we resolve immediately in startScanning)
    if (resolveScanningPromise) {
      resolveScanningPromise();
      resolveScanningPromise = null;
    }
  };


  async function checkFrameHealth() {
    const updatedItems = items.slice();
    let hasChanges = false;

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      const node = await getNodeById(item.nodeId);
      
      if (!node) {
        // Frame was deleted - mark as orphan if not already
        if (!item.name.includes('🚫')) {
          updatedItems[i] = Object.assign({}, item, {
            name: `🚫 ${item.name} (Missing)`
          });
          hasChanges = true;
        }
      } else {
        // Update name if changed
        if (node.name !== item.name && !item.name.includes('🚫')) {
          updatedItems[i] = Object.assign({}, item, {
            name: node.name
          });
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      setItems(updatedItems);
    }
  }

  async function handleMoveStatus(itemId, direction) {
   try {
    let itemIndex = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        itemIndex = i;
        break;
      }
    }
    if (itemIndex === -1) return Promise.resolve();

    const item = items[itemIndex];
    
    // Find index in the dynamic columns array directly
    let currentStatusIndex = -1;
    for(let i=0; i<columns.length; i++) {
        if(columns[i].id === item.status) {
            currentStatusIndex = i;
            break;
        }
    }
    
    // Fallback if status not found (maybe column deleted), reset to 0
    if (currentStatusIndex === -1 && columns.length > 0) currentStatusIndex = 0;
    
    let newStatusIndex;
    if (direction === 'next') {
      newStatusIndex = Math.min(currentStatusIndex + 1, columns.length - 1);
    } else {
      newStatusIndex = Math.max(currentStatusIndex - 1, 0);
    }

    if (newStatusIndex === currentStatusIndex) return Promise.resolve();

    const newStatus = columns[newStatusIndex].id;
    // REMOVED await getNodeById to prevent "Widget not registered" error on state update.
    // Ideally we would update the hash here, but preventing the crash is prioritized.
    // const node = await getNodeById(item.nodeId);
    
    // Check hash based on existing snapshot only for now to keep it synchronous
    let hash = item.snapshot;
    // if (node) { ... }

    // Safety check for user
    let userName = 'Unknown';
    try {
        if (figma.currentUser) {
            userName = figma.currentUser.name;
        }
    } catch (e) {
        console.error("Permission error accessing currentUser", e);
    }
    
    const timestamp = Date.now();

    const updatedItem = Object.assign({}, item, {
      status: newStatus,
      snapshot: hash,
      lastModifiedBy: userName,
      lastModifiedAt: timestamp,
      history: item.history.concat([{
        from: item.status,
        to: newStatus,
        by: userName,
        at: timestamp,
        snapshot: hash
      }])
    });

    const updatedItems = items.slice();
    updatedItems[itemIndex] = updatedItem;
    setItems(updatedItems);
    
    // Find label for notification
    const newStatusLabel = columns[newStatusIndex].label;

    figma.notify(`Moved to ${newStatusLabel}`);
    return Promise.resolve();
   } catch (err) {
       console.error("Move Error", err);
       figma.notify("Failed to move item: " + err.toString());
       return Promise.resolve();
   }
  }

  function handleCopyLink(nodeId) {
    return new Promise(resolve => {
        try {
            const fileKey = figma.fileKey; 
            let textToCopy = "";
            let successMessage = "";

            if (fileKey) {
                textToCopy = `https://www.figma.com/file/${fileKey}?node-id=${nodeId}`;
                successMessage = "Link copied to clipboard 🔗";
            } else {
                textToCopy = nodeId;
                successMessage = "Copied Node ID (File not published/saved)";
            }
            
            // Robust clipboard copy method
            figma.showUI(`
                <script>
                window.onmessage = (event) => {
                    const msg = event.data.pluginMessage;
                    if (msg && msg.type === 'copy') {
                        const textarea = document.createElement('textarea');
                        textarea.value = msg.text;
                        // Ensure it's part of the DOM and technically visible for focus
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        textarea.style.left = '0';
                        textarea.style.top = '0';
                        document.body.appendChild(textarea);
                        
                        textarea.focus();
                        textarea.select();
                        textarea.setSelectionRange(0, 99999); // Mobile fallback

                        let result = false;
                        try {
                           result = document.execCommand('copy');
                        } catch (err) {
                           console.error('Copy failed', err);
                        }
                        
                        document.body.removeChild(textarea);
                        window.parent.postMessage({pluginMessage: result ? 'success' : 'error'}, '*');
                    }
                }
                </script>
            `, { visible: false });
            
            figma.ui.postMessage({ type: 'copy', text: textToCopy });
            
            // Handle response
            figma.ui.onmessage = (msg) => {
                try { figma.ui.close(); } catch(e){}
                
                if (msg === 'success') {
                    figma.notify(successMessage);
                } else {
                    figma.notify("Failed to write to clipboard");
                }
                resolve();
            };

            // Timeout safety (1s)
            setTimeout(() => {
                try { figma.ui.close(); } catch(e){}
                resolve();
            }, 1000);

        } catch (e) {
            console.error("Copy Error", e);
            resolve();
        }
    });
  }

  async function handleJumpToFrame(nodeId) {
    try {
        const node = await getNodeById(nodeId);
        
        if (!node) {
        figma.notify('⚠️ Frame not found - it may have been deleted');
        return Promise.resolve();
        }

        figma.viewport.scrollAndZoomIntoView([node]);
        figma.notify('Navigated to frame');
        return Promise.resolve();
    } catch (e) {
        console.error("Jump Error", e);
        return Promise.resolve();
    }
  }

  async function handleRemoveCard(itemId) {
    const newItems = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].id !== itemId) {
        newItems.push(items[i]);
      }
    }
    setItems(newItems);
    figma.notify('Card removed');
  }

  async function handleCheckHealth(itemId) {
    try {
        let itemIndex = -1;
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === itemId) {
            itemIndex = i;
            break;
          }
        }
        if (itemIndex === -1) return Promise.resolve();

        const item = items[itemIndex];
        const node = await getNodeById(item.nodeId);
        
        if (!node) {
          figma.notify('⚠️ Frame is missing (Deleted?)');
          // Optional: Mark as missing in UI?
          return Promise.resolve();
        }

        const currentHash = generateFrameHash(node);
        const nameChanged = node.name !== item.name;
        const isModified = currentHash !== item.snapshot || nameChanged;

        if (isModified) {
           // Sync update
            let userName = 'Unknown';
            try { if (figma.currentUser) userName = figma.currentUser.name; } catch(e) {}
            const timestamp = Date.now();

            const updatedItem = Object.assign({}, item, {
                name: node.name,
                snapshot: currentHash,
                lastModifiedBy: userName,
                lastModifiedAt: timestamp
            });

            const newItems = items.slice();
            newItems[itemIndex] = updatedItem;
            setItems(newItems);
            
            figma.notify('✅ Frame synced');
        } else {
            figma.notify('✅ Frame is in sync');
        }
        return Promise.resolve();
    } catch (err) {
        console.error("Sync Error", err);
        return Promise.resolve();
    }
  }

  // Group items by status
  const groupedItems = {};
  
  // Initialize with dynamic columns
  columns.forEach(col => {
      groupedItems[col.id] = [];
  });
  
  // Handle orphans (columns that were deleted) by dumping them in the first column or a dedicated "Unsorted"
  const fallbackColumnId = columns.length > 0 ? columns[0].id : null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (Object.prototype.hasOwnProperty.call(groupedItems, item.status)) {
        groupedItems[item.status].push(item);
    } else if (fallbackColumnId) {
        // Auto-migrate orphaned items to first column
        // Note: This modifies display but doesn't persist status change until moved
        groupedItems[fallbackColumnId].push(item);
    }
  }

  // --- COLUMN EDITOR ---
  if (isEditingColumns) {
      return h(AutoLayout, {
        direction: "vertical",
        spacing: 16,
        padding: 20,
        fill: "#FFFFFF",
        cornerRadius: 8,
        effect: SHADOW_EFFECT,
        width: 600
      },
        h(AutoLayout, {
            direction: "horizontal",
            width: "fill-parent",
            verticalAlignItems: "center",
            spacing: 8
        },
            h(Text, { fontSize: 16, fontWeight: "bold" }, "⚙️ Edit Columns"),
            h(AutoLayout, { width: "fill-parent" }),
            h(AutoLayout, {
                padding: {vertical: 6, horizontal: 12},
                cornerRadius: 6,
                fill: "#10B981",
                onClick: () => {
                    // Add new column
                    const newId = 'COL_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                    setColumns(columns.concat([{ 
                        id: newId, 
                        label: 'New Column', 
                        color: '#6B7280', 
                        bgColor: '#F3F4F6' 
                    }]));
                },
                hoverStyle: { fill: "#059669" }
            }, h(Text, { fill: "#FFF", fontWeight: "bold" }, "+ Add"))
        ),

        h(AutoLayout, { direction: "vertical", spacing: 8, width: "fill-parent" },
            columns.map((col, idx) => {
                return h(AutoLayout, {
                    key: col.id,
                    direction: "horizontal",
                    width: "fill-parent",
                    spacing: 8,
                    padding: 8,
                    fill: "#F9FAFB",
                    cornerRadius: 6,
                    verticalAlignItems: "center"
                },
                    // Move Up
                    idx > 0 ? h(AutoLayout, {
                        padding: 6,
                        onClick: () => {
                            const newCols = columns.slice();
                            const temp = newCols[idx - 1];
                            newCols[idx - 1] = newCols[idx];
                            newCols[idx] = temp;
                            setColumns(newCols);
                        }
                    }, h(Text, { fontSize: 16 }, "↑")) : h(AutoLayout, { width: 22 }),

                    // Move Down
                    idx < columns.length - 1 ? h(AutoLayout, {
                        padding: 6,
                        onClick: () => {
                            const newCols = columns.slice();
                            const temp = newCols[idx + 1];
                            newCols[idx + 1] = newCols[idx];
                            newCols[idx] = temp;
                            setColumns(newCols);
                        }
                    }, h(Text, { fontSize: 16 }, "↓")) : h(AutoLayout, { width: 22 }),

                    // Color Picker (Rich UI)
                    h(AutoLayout, {
                        width: 24, height: 24,
                        cornerRadius: 12,
                        fill: col.color,
                        stroke: "#E5E7EB",
                        strokeWidth: 1,
                        onClick: () => {
                             return new Promise((resolve) => {
                                 const currentHex = col.color;
                                 const presets = [
                                    '#9333EA', '#2563EB', '#06B6D4', '#16A34A', 
                                    '#F59E0B', '#DC2626', '#6B7280', '#111827'
                                 ];
                                 
                                 const html = `
                                    <style>
                                      body { 
                                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                                        padding: 16px; 
                                        font-size: 13px; 
                                        color: #333; 
                                      }
                                      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
                                      .swatch { width: 40px; height: 40px; border-radius: 20px; cursor: pointer; border: 2px solid transparent; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s; }
                                      .swatch:hover { transform: scale(1.1); }
                                      .swatch.active { border-color: #000; }
                                      .input-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-top: 10px; border-top: 1px solid #eee; }
                                      input[type="text"] { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; font-variant-numeric: tabular-nums; font-family: inherit; }
                                      input[type="color"] { width: 44px; height: 40px; padding: 0; border: none; background: none; cursor: pointer; }
                                      button { width: 100%; padding: 10px; background: #2563EB; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 14px; font-family: inherit; }
                                      button:hover { background: #1D4ED8; }
                                      h3 { margin: 0 0 16px 0; font-size: 14px; font-weight: 600; }
                                      .label { font-size: 11px; color: #666; margin-bottom: 4px; display: block; }
                                    </style>
                                    <div>
                                      <h3>Select Column Color</h3>
                                      <div class="grid">
                                        ${presets.map(c => 
                                            `<div class="swatch ${c === currentHex ? 'active' : ''}" style="background: ${c}" onclick="selectColor('${c}')"></div>`
                                        ).join('')}
                                      </div>
                                      
                                      <span class="label">Custom Value</span>
                                      <div class="input-row">
                                         <input type="color" id="nativePicker" value="${currentHex}" oninput="updateHex(this.value)">
                                         <input type="text" id="hexInput" value="${currentHex}" oninput="updatePicker(this.value)">
                                      </div>
                                      <button id="save" onclick="save()">Apply Color</button>
                                    </div>
                                    <script>
                                      let selectedColor = "${currentHex}";
                                      
                                      function selectColor(c) {
                                          selectedColor = c;
                                          document.getElementById('nativePicker').value = c;
                                          document.getElementById('hexInput').value = c;
                                          updateActiveSwatch(c);
                                      }
                                      
                                      function updateHex(c) {
                                          selectedColor = c;
                                          document.getElementById('hexInput').value = c;
                                          updateActiveSwatch(c);
                                      }
                                      
                                      function updatePicker(c) {
                                          if (c.startsWith('#') && c.length === 7) {
                                              selectedColor = c;
                                              document.getElementById('nativePicker').value = c;
                                              updateActiveSwatch(c);
                                          }
                                      }
                                      
                                      function updateActiveSwatch(c) {
                                          document.querySelectorAll('.swatch').forEach(el => {
                                              el.classList.remove('active');
                                              // Approximate check (simple string match)
                                              if (el.style.backgroundColor && rgbToHex(el.style.backgroundColor).toUpperCase() === c.toUpperCase()) {
                                                  el.classList.add('active');
                                              }
                                          });
                                      }
                                      
                                      // Helper for swatch matching (browser returns rgb)
                                      function rgbToHex(col) {
                                          if(col.charAt(0)=='r'){
                                              col=col.replace('rgb(','').replace(')','').split(',');
                                              var r=parseInt(col[0], 10).toString(16);
                                              var g=parseInt(col[1], 10).toString(16);
                                              var b=parseInt(col[2], 10).toString(16);
                                              r=r.length==1?'0'+r:r; g=g.length==1?'0'+g:g; b=b.length==1?'0'+b:b;
                                              return '#'+r+g+b;
                                          }
                                          return col;
                                       }

                                      function save() {
                                          window.parent.postMessage({pluginMessage: { type: 'set-color', color: selectedColor }}, '*');
                                      }
                                    </script>
                                 `;
                                 
                                 figma.showUI(html, { width: 260, height: 320, title: "Pick a Color" });
                                 
                                 figma.ui.onmessage = (msg) => {
                                     if (msg.type === 'set-color') {
                                         const newColor = msg.color;
                                         const newBg = generatePastelColor(newColor);
                                         
                                         const newCols = columns.slice();
                                         newCols[idx] = Object.assign({}, col, { color: newColor, bgColor: newBg });
                                         setColumns(newCols);
                                         
                                         figma.closePlugin(); // Wait, this closes the widget entirely? No, figma.closePlugin() closes the plugin. For widgets, figma.ui.close() or figma.closePlugin() behaves similarly in some contexts?
                                         // For widgets, `figma.ui.close()` is correct to close the UI window.
                                         figma.ui.close(); 
                                     }
                                     resolve();
                                 };
                             });
                        }
                    }),

                    // Name Input
                    h(Input, {
                        value: col.label,
                        onTextEditEnd: (e) => {
                            const newCols = columns.slice();
                            newCols[idx] = Object.assign({}, col, { label: e.characters });
                            setColumns(newCols);
                        },
                        width: "fill-parent",
                        fontSize: 14,
                        fill: "#111827"
                    }),

                    // Delete
                    h(AutoLayout, {
                        padding: 6,
                        onClick: () => {
                            if (columns.length <= 1) {
                                figma.notify("Cannot delete the last column.");
                                return;
                            }
                            // Filter out
                            const newCols = columns.filter(c => c.id !== col.id);
                            setColumns(newCols);
                        }
                    }, h(Text, { fill: "#DC2626" }, "🗑️"))
                );
            })
        ),

        h(AutoLayout, {
            width: "fill-parent",
            horizontalAlignItems: "center",
            padding: 12,
            fill: "#2563EB",
            cornerRadius: 6,
            onClick: () => setIsEditingColumns(false),
            hoverStyle: { fill: "#1D4ED8" }
        }, h(Text, { fill: "#FFF", fontWeight: "bold" }, "Done"))
      );
  }

  // --- MAIN BOARD ---
  return h(AutoLayout, {
    direction: "vertical",
    spacing: 0,
    padding: 20,
    fill: "#FFFFFF",
    cornerRadius: 8,
    effect: SHADOW_EFFECT
  },
    h(AutoLayout, {
      direction: "horizontal",
      spacing: 8,
      width: "fill-parent",
      verticalAlignItems: "center",
      padding: HEADER_PADDING
    },
      h(AutoLayout, {
        direction: "vertical",
        spacing: 4
      },
        h(Text, { fontSize: 24, fontWeight: "bold" }, "🎯 Mission Control"),
        h(Text, { fontSize: 12, fill: "#6B7280" }, 
          `DesignLog Kanban • ${items.length} frame${items.length !== 1 ? 's' : ''} tracked`
        )
      ),

      h(AutoLayout, { width: "fill-parent" }),

      isScanning 
        ? h(AutoLayout, {
            direction: "horizontal",
            spacing: 8
          },
          h(AutoLayout, {
            padding: { top: 8, bottom: 8, left: 16, right: 16 },
            fill: scanCount > 0 ? "#10B981" : "#E5E7EB",
            cornerRadius: 6,
            onClick: confirmAddItems,
            hoverStyle: scanCount > 0 ? { fill: "#059669" } : {}
          },
             h(Text, { fontSize: 12, fill: scanCount > 0 ? "#FFFFFF" : "#9CA3AF", fontWeight: "bold" }, 
               scanCount > 0 ? `Add (${scanCount}) Selected Frame${scanCount > 1 ? 's' : ''}` : "Selecting (0)..."
             )
          ),
          h(AutoLayout, {
            padding: { top: 8, bottom: 8, left: 8, right: 8 },
            fill: "#F3F4F6",
            cornerRadius: 6,
            onClick: stopScanning,
            hoverStyle: { fill: "#E5E7EB" }
          },
             h(Text, { fontSize: 12, fill: "#6B7280" }, "×")
          )
        )
        : h(AutoLayout, {
            padding: { top: 8, bottom: 8, left: 16, right: 16 },
            fill: "#2563EB",
            cornerRadius: 6,
            onClick: startScanning,
            hoverStyle: { fill: "#1D4ED8" }
          },
             h(Text, { fontSize: 12, fill: "#FFFFFF", fontWeight: "bold" }, "+ Add Frames")
          )
    ),

    h(AutoLayout, {
      direction: "horizontal",
      spacing: 16,
      // Removed width: "fill-parent" to allow board to grow with columns
      // Removed wrap: true to force horizontal layout
      padding: { top: 16 }
    },
      columns.map((col, idx) => h(Column, {
        key: col.id,
        config: col,
        canMovePrev: idx > 0,
        canMoveNext: idx < columns.length - 1,
        items: groupedItems[col.id],
        onMoveStatus: handleMoveStatus,
        onJumpToFrame: handleJumpToFrame,
        onCopyLink: handleCopyLink,
        onRemoveCard: handleRemoveCard,
        handleCheckHealth: handleCheckHealth
      }))
    ),

    items.length === 0 ? h(AutoLayout, {
      direction: "vertical",
      spacing: 8,
      horizontalAlignItems: "center",
      padding: 40,
      width: "fill-parent"
    },
      h(Text, { fontSize: 16, fill: "#9CA3AF" }, "No frames tracked yet"),
      isScanning 
        ? h(Text, { fontSize: 12, fill: "#10B981", fontWeight: "bold" }, "Selection Mode Active. Click frames to select.")
        : h(Text, { fontSize: 12, fill: "#D1D5DB" }, "Click \"+ Add Frames\" to start selecting items.")
    ) : null
  );
}

// ============================================
// COLUMN COMPONENT
// ============================================

function Column({ config, canMovePrev, canMoveNext, items, onMoveStatus, onJumpToFrame, onCopyLink, onRemoveCard, handleCheckHealth }) {
  // Config passed directly from parent

  return h(AutoLayout, {
    direction: "vertical",
    spacing: 8,
    padding: 12,
    fill: config.bgColor,
    cornerRadius: 6,
    width: 260 // Fixed width for stability
  },
    h(AutoLayout, {
      direction: "horizontal",
      spacing: 8,
      width: "fill-parent",
      verticalAlignItems: "center"
    },
      h(Text, { fontSize: 14, fontWeight: "semi-bold", fill: config.color }, config.label),
      h(Text, { fontSize: 12, fill: "#9CA3AF" }, items.length.toString())
    ),

    items.map(item => h(Card, {
      key: item.id,
      item: item,
      canMovePrev: canMovePrev,
      canMoveNext: canMoveNext,
      onMoveStatus: onMoveStatus,
      onJumpToFrame: onJumpToFrame,
      onCopyLink: onCopyLink,
      onRemoveCard: onRemoveCard,
      handleCheckHealth: handleCheckHealth
    })),

    items.length === 0 ? h(AutoLayout, {
      padding: 16,
      horizontalAlignItems: "center",
      width: "fill-parent"
    },
      h(Text, { fontSize: 11, fill: "#D1D5DB" }, "Empty")
    ) : null
  );
}

// ============================================
// CARD COMPONENT
// ============================================

function Card({ item, canMovePrev, canMoveNext, onMoveStatus, onJumpToFrame, onCopyLink, onRemoveCard, handleCheckHealth }) {
  const isMissing = item.name.includes('🚫');
  const dateObj = new Date(item.lastModifiedAt);
  const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  
  return h(AutoLayout, {
    direction: "vertical",
    spacing: 8,
    padding: 12,
    fill: "#FFFFFF",
    cornerRadius: 4,
    width: "fill-parent",
    effect: CARD_SHADOW_EFFECT
  },
    h(AutoLayout, {
      direction: "vertical",
      spacing: 4,
      width: "fill-parent"
    },
      h(Text, { 
        fontSize: 13, 
        fontWeight: "semi-bold",
        fill: isMissing ? "#DC2626" : "#111827",
        width: "fill-parent"
      }, item.name),
      
      item.externalLink ? h(AutoLayout, {
        direction: "horizontal",
        spacing: 4
      },
        h(Text, { fontSize: 11 }, detectLinkProvider(item.externalLink)),
        h(Text, { fontSize: 10, fill: "#6B7280" }, "Linked")
      ) : null
    ),

    h(AutoLayout, {
      direction: "vertical",
      spacing: 2,
      width: "fill-parent"
    },
      h(Text, { fontSize: 10, fill: "#6B7280" }, `by ${item.lastModifiedBy}`),
      h(Text, { fontSize: 10, fill: "#9CA3AF" }, `${dateStr}, ${timeStr}`)
    ),

    h(AutoLayout, {
      direction: "horizontal",
      spacing: 4,
      width: "fill-parent"
    },
      h(AutoLayout, {
        padding: BUTTON_PADDING,
        fill: "#F3F4F6",
        cornerRadius: 3,
        // MUST return the promise here because we use figma.showUI validation/clipboard logic
        onClick: () => onCopyLink(item.nodeId),
        hoverStyle: BUTTON_HOVER
      },
        h(Text, { fontSize: 10, fill: "#374151" }, "🔗")
      ),

      h(AutoLayout, {
        padding: BUTTON_PADDING,
        fill: "#F3F4F6",
        cornerRadius: 3,
        hoverStyle: BUTTON_HOVER,
        spacing: 4,
        direction: 'horizontal',
        verticalAlignItems: 'center'
      },
        // Icon triggers fast local jump (Design Mode optimized)
        h(Text, { 
          fontSize: 10, 
          fill: "#374151",
          onClick: () => onJumpToFrame(item.nodeId)
        }, "🎯"),

        // Text is a pure link (Dev Mode optimized, mimics native Figma text links)
        h(Text, {
          fontSize: 10,
          fill: "#18A0FB", // Figma Blue
          textDecoration: "underline",
          tooltip: `Jump to ${item.name}`,
          // Interactive in Design Mode
          onClick: () => onJumpToFrame(item.nodeId),
          // Relative link works for both Desktop and Web, keeping contextual file reference
          href: `?node-id=${encodeURIComponent(item.nodeId)}`
        }, "Jump")
      ),

      h(AutoLayout, {
        padding: BUTTON_PADDING,
        fill: "#F3F4F6",
        cornerRadius: 3,
        onClick: () => { handleCheckHealth(item.id); },
        hoverStyle: BUTTON_HOVER
      },
        h(Text, { fontSize: 10, fill: "#374151" }, "↻")
      ),

      canMovePrev ? h(AutoLayout, {
        padding: BUTTON_PADDING,
        fill: "#F3F4F6",
        cornerRadius: 3,
        onClick: () => onMoveStatus(item.id, 'prev'),
        hoverStyle: BUTTON_HOVER
      },
        h(Text, { fontSize: 10, fill: "#374151" }, "←")
      ) : null,

      canMoveNext ? h(AutoLayout, {
        padding: BUTTON_PADDING,
        fill: "#F3F4F6",
        cornerRadius: 3,
        onClick: () => onMoveStatus(item.id, 'next'),
        hoverStyle: BUTTON_HOVER
      },
        h(Text, { fontSize: 10, fill: "#374151" }, "→")
      ) : null,

      h(AutoLayout, {
        padding: BUTTON_PADDING,
        fill: "#FEE2E2",
        cornerRadius: 3,
        onClick: () => onRemoveCard(item.id),
        hoverStyle: REMOVE_HOVER
      },
        h(Text, { fontSize: 10, fill: "#DC2626" }, "×")
      )
    )
  );
}

// ============================================
// WIDGET REGISTRATION
// ============================================

widget.register(DesignLogKanban);
