(() => {
  // code.tsx
  var { widget } = figma;
  var {
    AutoLayout,
    Text,
    Input,
    useSyncedState,
    usePropertyMenu,
    useEffect,
    h
  } = widget;
  var DEFAULT_COLUMNS = [
    { id: "RESEARCH", label: "\u{1F7E3} Research", color: "#9333EA", bgColor: "#F3E8FF" },
    { id: "EXPLORATION", label: "\u{1F535} Exploration", color: "#2563EB", bgColor: "#DBEAFE" },
    { id: "IN_REVIEW", label: "\u{1F7E0} In Review", color: "#EA580C", bgColor: "#FFEDD5" },
    { id: "READY_FOR_DEV", label: "\u{1F7E2} Ready for Dev", color: "#16A34A", bgColor: "#DCFCE7" },
    { id: "ARCHIVED", label: "\u26AB Archived", color: "#6B7280", bgColor: "#F3F4F6" }
  ];
  var SHADOW_COLOR = { r: 0, g: 0, b: 0, a: 0.1 };
  var SHADOW_OFFSET = { x: 0, y: 2 };
  var SHADOW_EFFECT = {
    type: "drop-shadow",
    color: SHADOW_COLOR,
    offset: SHADOW_OFFSET,
    blur: 8
  };
  var HEADER_PADDING = { bottom: 16 };
  var CARD_SHADOW_COLOR = { r: 0, g: 0, b: 0, a: 0.05 };
  var CARD_SHADOW_OFFSET = { x: 0, y: 1 };
  var CARD_SHADOW_EFFECT = {
    type: "drop-shadow",
    color: CARD_SHADOW_COLOR,
    offset: CARD_SHADOW_OFFSET,
    blur: 3
  };
  var BUTTON_PADDING = { vertical: 4, horizontal: 8 };
  var BUTTON_HOVER = { fill: "#E5E7EB" };
  var REMOVE_HOVER = { fill: "#FECACA" };
  function generateFrameHash(node) {
    const hashData = JSON.stringify({
      type: node.type,
      name: node.name,
      x: node.x,
      y: node.y,
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0
      // Add more properties as needed for more granular tracking
    });
    let hash = 0;
    for (let i = 0; i < hashData.length; i++) {
      const char = hashData.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  function generatePastelColor(hex) {
    if (!hex || hex.length < 7)
      return "#F3F4F6";
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const factor = 0.9;
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    const toHex = (c) => {
      const h2 = c.toString(16);
      return h2.length === 1 ? "0" + h2 : h2;
    };
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }
  function detectLinkProvider(url) {
    if (url.includes("jira"))
      return "\u{1F535}";
    if (url.includes("linear"))
      return "\u25C6";
    if (url.includes("github"))
      return "\u{1F419}";
    if (url.includes("gitlab"))
      return "\u{1F98A}";
    return "\u{1F517}";
  }
  async function getNodeById(nodeId) {
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      return node;
    } catch (e) {
      return null;
    }
  }
  var resolveScanningPromise = null;
  var globalSelectionHandler = null;
  var globalScannedNodes = [];
  function DesignLogKanban() {
    const [items, setItems] = useSyncedState("items", []);
    const [selectedCard, setSelectedCard] = useSyncedState("selectedCard", null);
    const [refreshKey, setRefreshKey] = useSyncedState("refreshKey", 0);
    const [columns, setColumns] = useSyncedState("columns", DEFAULT_COLUMNS);
    const [isEditingColumns, setIsEditingColumns] = useSyncedState("isEditingColumns", false);
    const [isScanning, setIsScanning] = useSyncedState("isScanning", false);
    const [scanCount, setScanCount] = useSyncedState("scanCount", 0);
    const [scannedIds, setScannedIds] = useSyncedState("scannedIds", []);
    const [manualFileKey, setManualFileKey] = useSyncedState("manualFileKey", "");
    usePropertyMenu(
      [
        {
          itemType: "action",
          tooltip: "Edit Columns",
          propertyName: "editColumns"
        },
        {
          itemType: "action",
          tooltip: "Fix Dev Mode Links",
          propertyName: "fixLinks"
        },
        {
          itemType: "separator"
        },
        {
          itemType: "action",
          tooltip: "Refresh Status",
          propertyName: "refresh"
        },
        {
          itemType: "separator"
        },
        {
          itemType: "action",
          tooltip: "Clear All",
          propertyName: "clearAll"
        }
      ],
      async ({ propertyName }) => {
        if (propertyName === "editColumns") {
          setIsEditingColumns(!isEditingColumns);
        } else if (propertyName === "refresh") {
          setRefreshKey(refreshKey + 1);
        } else if (propertyName === "clearAll") {
          setItems([]);
          setScanCount(0);
          setIsScanning(false);
        } else if (propertyName === "fixLinks") {
          return new Promise((resolve) => {
            const html = `
            <style>
              body { font-family: Inter, sans-serif; padding: 16px; color: #333; }
              input { width: 100%; padding: 8px; margin: 8px 0; border: 1px solid #ccc; border-radius: 4px; }
              button { padding: 8px 16px; background: #2563EB; color: white; border: none; border-radius: 4px; cursor: pointer; }
              p { font-size: 12px; line-height: 1.5; color: #666; }
            </style>
            <div>
              <h3>Fix Dev Mode Links</h3>
              <p>Since this file hasn't been published/synced yet, the internal File Key is missing. Please copy the URL from your browser address bar and paste it below so we can generate valid links.</p>
              <input type="text" id="url" placeholder="https://www.figma.com/design/..." />
              <button onclick="save()">Save URL</button>
            </div>
            <script>
              function save() {
                const url = document.getElementById('url').value;
                window.parent.postMessage({pluginMessage: { type: 'set-file-url', url }}, '*');
              }
            <\/script>
          `;
            figma.showUI(html, { width: 300, height: 260, title: "Configure Links" });
            figma.ui.onmessage = (msg) => {
              if (msg.type === "set-file-url") {
                const url = msg.url;
                const match = url.match(/(?:file|design)\/([a-zA-Z0-9]+)/);
                if (match && match[1]) {
                  setManualFileKey(match[1]);
                  figma.notify("Links configured successfully!");
                } else {
                  figma.notify("Could not find File Key in URL. Please try again.");
                }
                figma.ui.close();
              }
              resolve();
            };
          });
        }
      }
    );
    useEffect(() => {
    });
    async function startScanning() {
      if (resolveScanningPromise) {
        resolveScanningPromise();
        resolveScanningPromise = null;
      }
      if (figma.ui) {
        try {
          figma.ui.close();
        } catch (e) {
        }
      }
      setIsScanning(true);
      setScanCount(0);
      globalScannedNodes = [];
      figma.notify("Selection Mode Active: Select frames on canvas to add them...", { timeout: 2e3 });
      const checkSelection = () => {
        if (!figma.currentPage)
          return;
        const selection = figma.currentPage.selection;
        if (selection.length === 1 && selection[0].type === "WIDGET") {
          return;
        }
        const validNodes = selection.filter(
          (node) => ["FRAME", "SECTION", "COMPONENT", "INSTANCE"].includes(node.type)
        );
        globalScannedNodes = validNodes;
        const count = validNodes.length;
        setScanCount(count);
        setScannedIds(validNodes.map((n) => n.id));
      };
      globalSelectionHandler = checkSelection;
      checkSelection();
      figma.on("selectionchange", checkSelection);
      try {
        figma.showUI(`
        <script>
          window.onmessage = (event) => {
            if (event.data && event.data.pluginMessage && event.data.pluginMessage.type === 'close') {
              window.close();
            }
          }
        <\/script>
      `, { visible: false, title: "Mission Control Scanner" });
      } catch (err) {
        console.error("Failed to show UI:", err);
      }
      return Promise.resolve();
    }
    async function confirmAddItems() {
      try {
        const currentScannedIds = scannedIds || [];
        let validNodes = [];
        if (globalScannedNodes && globalScannedNodes.length > 0) {
          validNodes = globalScannedNodes;
        }
        if (validNodes.length === 0 && currentScannedIds.length > 0) {
          validNodes = currentScannedIds.map((id) => figma.getNodeById(id)).filter((n) => n !== null);
        }
        if (validNodes.length === 0) {
          figma.notify("No items selected (Selection might have been lost). Try again.");
          stopScanning();
          return Promise.resolve();
        }
        let userName = "Unknown";
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
          if (!node || !node.id)
            continue;
          const isTracked = items.some((item) => item.nodeId === node.id) || newItems.some((i) => i.nodeId === node.id);
          if (isTracked) {
            duplicateCount++;
            continue;
          }
          let hash = "hash-error";
          try {
            hash = generateFrameHash(node);
          } catch (e) {
            console.error("Hash error", e);
          }
          const newItem = {
            id: `item-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
            nodeId: node.id,
            name: node.name || "Untitled",
            status: "RESEARCH",
            snapshot: hash,
            addedBy: userName,
            addedAt: timestamp,
            lastModifiedBy: userName,
            lastModifiedAt: timestamp,
            history: [{
              from: null,
              to: "RESEARCH",
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
          figma.notify(`Added ${addedCount} item${addedCount !== 1 ? "s" : ""}`);
        } else if (duplicateCount > 0) {
          figma.notify(`All selected items are already tracked.`);
        } else {
          figma.notify("No valid items selected.");
        }
        stopScanning();
        return Promise.resolve();
      } catch (err) {
        console.error("Confirm Error", err);
        figma.notify("Error adding items: " + err.toString());
        stopScanning();
        return Promise.resolve();
      }
    }
    const stopScanning = () => {
      if (globalSelectionHandler) {
        figma.off("selectionchange", globalSelectionHandler);
        globalSelectionHandler = null;
      }
      if (figma.ui) {
        try {
          figma.ui.hide();
        } catch (e) {
        }
        try {
          figma.ui.close();
        } catch (e) {
        }
      }
      setIsScanning(false);
      setScanCount(0);
      setScannedIds([]);
      globalScannedNodes = [];
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
          if (!item.name.includes("\u{1F6AB}")) {
            updatedItems[i] = Object.assign({}, item, {
              name: `\u{1F6AB} ${item.name} (Missing)`
            });
            hasChanges = true;
          }
        } else {
          if (node.name !== item.name && !item.name.includes("\u{1F6AB}")) {
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
        if (itemIndex === -1)
          return Promise.resolve();
        const item = items[itemIndex];
        let currentStatusIndex = -1;
        for (let i = 0; i < columns.length; i++) {
          if (columns[i].id === item.status) {
            currentStatusIndex = i;
            break;
          }
        }
        if (currentStatusIndex === -1 && columns.length > 0)
          currentStatusIndex = 0;
        let newStatusIndex;
        if (direction === "next") {
          newStatusIndex = Math.min(currentStatusIndex + 1, columns.length - 1);
        } else {
          newStatusIndex = Math.max(currentStatusIndex - 1, 0);
        }
        if (newStatusIndex === currentStatusIndex)
          return Promise.resolve();
        const newStatus = columns[newStatusIndex].id;
        let hash = item.snapshot;
        let userName = "Unknown";
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
      return new Promise((resolve) => {
        try {
          const fileKey = figma.fileKey;
          let textToCopy = "";
          let successMessage = "";
          if (fileKey) {
            textToCopy = `https://www.figma.com/file/${fileKey}?node-id=${nodeId}`;
            successMessage = "Link copied to clipboard \u{1F517}";
          } else {
            textToCopy = nodeId;
            successMessage = "Copied Node ID (File not published/saved)";
          }
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
                <\/script>
            `, { visible: false });
          figma.ui.postMessage({ type: "copy", text: textToCopy });
          figma.ui.onmessage = (msg) => {
            try {
              figma.ui.close();
            } catch (e) {
            }
            if (msg === "success") {
              figma.notify(successMessage);
            } else {
              figma.notify("Failed to write to clipboard");
            }
            resolve();
          };
          setTimeout(() => {
            try {
              figma.ui.close();
            } catch (e) {
            }
            resolve();
          }, 1e3);
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
          figma.notify("\u26A0\uFE0F Frame not found - it may have been deleted");
          return Promise.resolve();
        }
        figma.viewport.scrollAndZoomIntoView([node]);
        figma.notify("Navigated to frame");
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
      figma.notify("Card removed");
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
        if (itemIndex === -1)
          return Promise.resolve();
        const item = items[itemIndex];
        const node = await getNodeById(item.nodeId);
        if (!node) {
          figma.notify("\u26A0\uFE0F Frame is missing (Deleted?)");
          return Promise.resolve();
        }
        const currentHash = generateFrameHash(node);
        const nameChanged = node.name !== item.name;
        const isModified = currentHash !== item.snapshot || nameChanged;
        if (isModified) {
          let userName = "Unknown";
          try {
            if (figma.currentUser)
              userName = figma.currentUser.name;
          } catch (e) {
          }
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
          figma.notify("\u2705 Frame synced");
        } else {
          figma.notify("\u2705 Frame is in sync");
        }
        return Promise.resolve();
      } catch (err) {
        console.error("Sync Error", err);
        return Promise.resolve();
      }
    }
    const groupedItems = {};
    columns.forEach((col) => {
      groupedItems[col.id] = [];
    });
    const fallbackColumnId = columns.length > 0 ? columns[0].id : null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (Object.prototype.hasOwnProperty.call(groupedItems, item.status)) {
        groupedItems[item.status].push(item);
      } else if (fallbackColumnId) {
        groupedItems[fallbackColumnId].push(item);
      }
    }
    if (isEditingColumns) {
      return h(
        AutoLayout,
        {
          direction: "vertical",
          spacing: 16,
          padding: 20,
          fill: "#FFFFFF",
          cornerRadius: 8,
          effect: SHADOW_EFFECT,
          width: 600
        },
        h(
          AutoLayout,
          {
            direction: "horizontal",
            width: "fill-parent",
            verticalAlignItems: "center",
            spacing: 8
          },
          h(Text, { fontSize: 16, fontWeight: "bold" }, "\u2699\uFE0F Edit Columns"),
          h(AutoLayout, { width: "fill-parent" }),
          h(AutoLayout, {
            padding: { vertical: 6, horizontal: 12 },
            cornerRadius: 6,
            fill: "#10B981",
            onClick: () => {
              const newId = "COL_" + Math.random().toString(36).substr(2, 6).toUpperCase();
              setColumns(columns.concat([{
                id: newId,
                label: "New Column",
                color: "#6B7280",
                bgColor: "#F3F4F6"
              }]));
            },
            hoverStyle: { fill: "#059669" }
          }, h(Text, { fill: "#FFF", fontWeight: "bold" }, "+ Add"))
        ),
        h(
          AutoLayout,
          { direction: "vertical", spacing: 8, width: "fill-parent" },
          columns.map((col, idx) => {
            return h(
              AutoLayout,
              {
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
              }, h(Text, { fontSize: 16 }, "\u2191")) : h(AutoLayout, { width: 22 }),
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
              }, h(Text, { fontSize: 16 }, "\u2193")) : h(AutoLayout, { width: 22 }),
              // Color Picker (Rich UI)
              h(AutoLayout, {
                width: 24,
                height: 24,
                cornerRadius: 12,
                fill: col.color,
                stroke: "#E5E7EB",
                strokeWidth: 1,
                onClick: () => {
                  return new Promise((resolve) => {
                    const currentHex = col.color;
                    const presets = [
                      "#9333EA",
                      "#2563EB",
                      "#06B6D4",
                      "#16A34A",
                      "#F59E0B",
                      "#DC2626",
                      "#6B7280",
                      "#111827"
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
                                        ${presets.map(
                      (c) => `<div class="swatch ${c === currentHex ? "active" : ""}" style="background: ${c}" onclick="selectColor('${c}')"></div>`
                    ).join("")}
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
                                    <\/script>
                                 `;
                    figma.showUI(html, { width: 260, height: 320, title: "Pick a Color" });
                    figma.ui.onmessage = (msg) => {
                      if (msg.type === "set-color") {
                        const newColor = msg.color;
                        const newBg = generatePastelColor(newColor);
                        const newCols = columns.slice();
                        newCols[idx] = Object.assign({}, col, { color: newColor, bgColor: newBg });
                        setColumns(newCols);
                        figma.closePlugin();
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
                  const newCols = columns.filter((c) => c.id !== col.id);
                  setColumns(newCols);
                }
              }, h(Text, { fill: "#DC2626" }, "\u{1F5D1}\uFE0F"))
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
    return h(
      AutoLayout,
      {
        direction: "vertical",
        spacing: 0,
        padding: 20,
        fill: "#FFFFFF",
        cornerRadius: 8,
        effect: SHADOW_EFFECT
      },
      h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: 8,
          width: "fill-parent",
          verticalAlignItems: "center",
          padding: HEADER_PADDING
        },
        h(
          AutoLayout,
          {
            direction: "vertical",
            spacing: 4
          },
          h(Text, { fontSize: 24, fontWeight: "bold" }, "\u{1F3AF} Mission Control"),
          h(
            Text,
            { fontSize: 12, fill: "#6B7280" },
            `DesignLog Kanban \u2022 ${items.length} frame${items.length !== 1 ? "s" : ""} tracked`
          )
        ),
        h(AutoLayout, { width: "fill-parent" }),
        isScanning ? h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 8
          },
          h(
            AutoLayout,
            {
              padding: { top: 8, bottom: 8, left: 16, right: 16 },
              fill: scanCount > 0 ? "#10B981" : "#E5E7EB",
              cornerRadius: 6,
              onClick: confirmAddItems,
              hoverStyle: scanCount > 0 ? { fill: "#059669" } : {}
            },
            h(
              Text,
              { fontSize: 12, fill: scanCount > 0 ? "#FFFFFF" : "#9CA3AF", fontWeight: "bold" },
              scanCount > 0 ? `Add (${scanCount}) Selected Frame${scanCount > 1 ? "s" : ""}` : "Selecting (0)..."
            )
          ),
          h(
            AutoLayout,
            {
              padding: { top: 8, bottom: 8, left: 8, right: 8 },
              fill: "#F3F4F6",
              cornerRadius: 6,
              onClick: stopScanning,
              hoverStyle: { fill: "#E5E7EB" }
            },
            h(Text, { fontSize: 12, fill: "#6B7280" }, "\xD7")
          )
        ) : h(
          AutoLayout,
          {
            padding: { top: 8, bottom: 8, left: 16, right: 16 },
            fill: "#2563EB",
            cornerRadius: 6,
            onClick: startScanning,
            hoverStyle: { fill: "#1D4ED8" }
          },
          h(Text, { fontSize: 12, fill: "#FFFFFF", fontWeight: "bold" }, "+ Add Frames")
        )
      ),
      h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: 16,
          // Fixed: Must be "hug-contents" horizontally to prevent collapse, but let it grow
          width: "hug-contents",
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
          handleCheckHealth,
          fileKey: manualFileKey || figma.fileKey
        }))
      ),
      items.length === 0 ? h(
        AutoLayout,
        {
          direction: "vertical",
          spacing: 8,
          horizontalAlignItems: "center",
          padding: 40,
          width: "fill-parent"
        },
        h(Text, { fontSize: 16, fill: "#9CA3AF" }, "No frames tracked yet"),
        isScanning ? h(Text, { fontSize: 12, fill: "#10B981", fontWeight: "bold" }, "Selection Mode Active. Click frames to select.") : h(Text, { fontSize: 12, fill: "#D1D5DB" }, 'Click "+ Add Frames" to start selecting items.')
      ) : null
    );
  }
  function Column({ config, canMovePrev, canMoveNext, items, onMoveStatus, onJumpToFrame, onCopyLink, onRemoveCard, handleCheckHealth, fileKey }) {
    return h(
      AutoLayout,
      {
        direction: "vertical",
        spacing: 8,
        padding: 12,
        fill: config.bgColor,
        cornerRadius: 6,
        width: 260
        // Fixed width for stability
      },
      h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: 8,
          width: "fill-parent",
          verticalAlignItems: "center"
        },
        h(Text, { fontSize: 14, fontWeight: "semi-bold", fill: config.color }, config.label),
        h(Text, { fontSize: 12, fill: "#9CA3AF" }, items.length.toString())
      ),
      items.map((item) => h(Card, {
        key: item.id,
        item,
        canMovePrev,
        canMoveNext,
        onMoveStatus,
        onJumpToFrame,
        onCopyLink,
        onRemoveCard,
        handleCheckHealth,
        fileKey
      })),
      items.length === 0 ? h(
        AutoLayout,
        {
          padding: 16,
          horizontalAlignItems: "center",
          width: "fill-parent"
        },
        h(Text, { fontSize: 11, fill: "#D1D5DB" }, "Empty")
      ) : null
    );
  }
  function Card({ item, canMovePrev, canMoveNext, onMoveStatus, onJumpToFrame, onCopyLink, onRemoveCard, handleCheckHealth, fileKey }) {
    const isMissing = item.name.includes("\u{1F6AB}");
    const dateObj = new Date(item.lastModifiedAt);
    const dateStr = dateObj.toLocaleDateString(void 0, { month: "short", day: "numeric" });
    const timeStr = dateObj.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" });
    return h(
      AutoLayout,
      {
        direction: "vertical",
        spacing: 8,
        padding: 12,
        fill: "#FFFFFF",
        cornerRadius: 4,
        width: "fill-parent",
        effect: CARD_SHADOW_EFFECT
      },
      h(
        AutoLayout,
        {
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
        item.externalLink ? h(
          AutoLayout,
          {
            direction: "horizontal",
            spacing: 4
          },
          h(Text, { fontSize: 11 }, detectLinkProvider(item.externalLink)),
          h(Text, { fontSize: 10, fill: "#6B7280" }, "Linked")
        ) : null
      ),
      h(
        AutoLayout,
        {
          direction: "vertical",
          spacing: 2,
          width: "fill-parent"
        },
        h(Text, { fontSize: 10, fill: "#6B7280" }, `by ${item.lastModifiedBy}`),
        h(Text, { fontSize: 10, fill: "#9CA3AF" }, `${dateStr}, ${timeStr}`)
      ),
      h(
        AutoLayout,
        {
          direction: "horizontal",
          spacing: 4,
          width: "fill-parent"
        },
        h(
          AutoLayout,
          {
            padding: BUTTON_PADDING,
            fill: "#F3F4F6",
            cornerRadius: 3,
            // MUST return the promise here because we use figma.showUI validation/clipboard logic
            onClick: () => onCopyLink(item.nodeId),
            hoverStyle: BUTTON_HOVER
          },
          h(Text, { fontSize: 10, fill: "#374151" }, "\u{1F517}")
        ),
        h(
          AutoLayout,
          {
            padding: BUTTON_PADDING,
            fill: "#F3F4F6",
            cornerRadius: 3,
            hoverStyle: BUTTON_HOVER,
            spacing: 4,
            direction: "horizontal",
            verticalAlignItems: "center"
          },
          // Icon triggers fast local jump (Design Mode optimized)
          h(Text, {
            fontSize: 10,
            fill: "#374151",
            onClick: () => onJumpToFrame(item.nodeId)
          }, "\u{1F3AF}"),
          // Simple Jump link - always generate URL, let Figma handle validation
          h(Text, {
            fontSize: 10,
            fill: "#18A0FB",
            textDecoration: "underline",
            href: `https://www.figma.com/file/${figma.fileKey}?node-id=${item.nodeId.replace(":", "-")}`
          }, "Jump")
        ),
        h(
          AutoLayout,
          {
            padding: BUTTON_PADDING,
            fill: "#F3F4F6",
            cornerRadius: 3,
            onClick: () => {
              handleCheckHealth(item.id);
            },
            hoverStyle: BUTTON_HOVER
          },
          h(Text, { fontSize: 10, fill: "#374151" }, "\u21BB")
        ),
        canMovePrev ? h(
          AutoLayout,
          {
            padding: BUTTON_PADDING,
            fill: "#F3F4F6",
            cornerRadius: 3,
            onClick: () => onMoveStatus(item.id, "prev"),
            hoverStyle: BUTTON_HOVER
          },
          h(Text, { fontSize: 10, fill: "#374151" }, "\u2190")
        ) : null,
        canMoveNext ? h(
          AutoLayout,
          {
            padding: BUTTON_PADDING,
            fill: "#F3F4F6",
            cornerRadius: 3,
            onClick: () => onMoveStatus(item.id, "next"),
            hoverStyle: BUTTON_HOVER
          },
          h(Text, { fontSize: 10, fill: "#374151" }, "\u2192")
        ) : null,
        h(
          AutoLayout,
          {
            padding: BUTTON_PADDING,
            fill: "#FEE2E2",
            cornerRadius: 3,
            onClick: () => onRemoveCard(item.id),
            hoverStyle: REMOVE_HOVER
          },
          h(Text, { fontSize: 10, fill: "#DC2626" }, "\xD7")
        )
      )
    );
  }
  widget.register(DesignLogKanban);
})();
