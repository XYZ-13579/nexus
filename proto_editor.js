// --- Stage Editor Logic ---

const editorCanvas = document.getElementById('editor-canvas');
const ectx = editorCanvas.getContext('2d');
const editorOverlay = document.getElementById('editor-overlay');
const editModeBtn = document.getElementById('edit-mode-btn');

let editorTool = 'wall';
let editGrid = [];
let history = [];
let historyIndex = -1;

let dragStart = null;
let dragEnd = null;

let hoveredEdge = null; // { i, j, idx }
let editorZoom = 30; // pixels per cell
let editorOffsetX = 20;
let editorOffsetY = 20;
let isPanning = false;
let lastMousePos = { x: 0, y: 0 };

function initEditor() {
    // Sync UI with current globals
    document.getElementById('editor-cols').value = cols;
    document.getElementById('editor-rows').value = rows;
    document.getElementById('editor-enemy-size').value = enemySize;
    document.getElementById('editor-enemy-health').value = defaultEnemyHealth;
    document.getElementById('env-enemy-pass-doors').checked = envParams.enemyCanPassDoors;
    document.getElementById('env-enemy-ai-mode').value = envParams.enemyAiMode;

    // Use current grid if it exists and matches dimensions
    if (customMapData.cells && customMapData.cells.length === cols * rows) {
        editGrid = customMapData.cells;
    } else {
        editGrid = [];
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                editGrid.push({ i, j, walls: [0, 0, 0, 0] });
            }
        }
        customMapData.cells = editGrid;
        customMapData.width = cols;
        customMapData.height = rows;
    }

    resetView();
    if (historyIndex === -1) saveHistory();
}

function resetView() {
    const padding = 40;
    const availableW = editorCanvas.width - padding * 2;
    const availableH = editorCanvas.height - padding * 2;
    editorZoom = Math.min(availableW / cols, availableH / rows);
    editorOffsetX = (editorCanvas.width - cols * editorZoom) / 2;
    editorOffsetY = (editorCanvas.height - rows * editorZoom) / 2;
    drawEditor();
}

function updateGridDimensions() {
    const newCols = parseInt(document.getElementById('editor-cols').value) || cols;
    const newRows = parseInt(document.getElementById('editor-rows').value) || rows;

    if (newCols === cols && newRows === rows) return;

    const newGrid = [];
    for (let j = 0; j < newRows; j++) {
        for (let i = 0; i < newCols; i++) {
            const oldCell = editGrid.find(c => c.i === i && c.j === j);
            if (oldCell) {
                newGrid.push(JSON.parse(JSON.stringify(oldCell)));
            } else {
                newGrid.push({ i, j, walls: [0, 0, 0, 0] });
            }
        }
    }

    cols = newCols;
    rows = newRows;
    editGrid = newGrid;
    customMapData.cells = editGrid;
    customMapData.width = cols;
    customMapData.height = rows;

    // Boundary safety for entities
    if (customMapData.spawn.i >= cols) customMapData.spawn.i = cols - 1;
    if (customMapData.spawn.j >= rows) customMapData.spawn.j = rows - 1;
    if (customMapData.goal.i >= cols) customMapData.goal.i = cols - 1;
    if (customMapData.goal.j >= rows) customMapData.goal.j = rows - 1;
    customMapData.creatures = customMapData.creatures.filter(en => en.i < cols && en.j < rows);

    saveHistory();
    drawEditor();
}

document.getElementById('editor-cols').onchange = updateGridDimensions;
document.getElementById('editor-rows').onchange = updateGridDimensions;

document.getElementById('editor-enemy-size').addEventListener('change', (e) => {
    enemySize = parseFloat(e.target.value) || 1.0;
    spawnEnemies();
});
document.getElementById('editor-enemy-range').addEventListener('change', (e) => {
    enemySearchRange = parseInt(e.target.value) || 8;
});
document.getElementById('editor-enemy-speed').addEventListener('change', (e) => {
    enemyBaseSpeed = parseFloat(e.target.value) || 1.5;
    spawnEnemies();
});
document.getElementById('editor-enemy-health').addEventListener('change', (e) => {
    defaultEnemyHealth = parseInt(e.target.value) || 1;
    spawnEnemies();
});

function saveHistory() {
    history = history.slice(0, historyIndex + 1);
    history.push(JSON.stringify({
        cells: JSON.parse(JSON.stringify(editGrid)),
        spawn: { ...customMapData.spawn },
        goal: { ...customMapData.goal },
        creatures: JSON.parse(JSON.stringify(customMapData.creatures)),
        props: customMapData.props ? JSON.parse(JSON.stringify(customMapData.props)) : [],
        width: cols,
        height: rows
    }));
    if (history.length > 50) history.shift();
    else historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        applyState(JSON.parse(history[historyIndex]));
        drawEditor();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        applyState(JSON.parse(history[historyIndex]));
        drawEditor();
    }
}

function applyState(state) {
    editGrid = state.cells;
    customMapData.cells = editGrid;
    customMapData.spawn = state.spawn;
    customMapData.goal = state.goal;
    customMapData.creatures = state.creatures;
    customMapData.props = state.props || [];
    cols = state.width;
    rows = state.height;
    document.getElementById('editor-cols').value = cols;
    document.getElementById('editor-rows').value = rows;
}

function drawEditor() {
    const cellSize = editorZoom;
    ectx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

    ectx.save();
    ectx.translate(editorOffsetX, editorOffsetY);

    // Draw Grid Background (Outer boundary)
    ectx.fillStyle = '#050505';
    ectx.fillRect(0, 0, cols * cellSize, rows * cellSize);

    // Draw Grid Cells
    ectx.beginPath();
    ectx.strokeStyle = '#222';
    ectx.lineWidth = 1;
    for (let j = 0; j <= rows; j++) {
        ectx.moveTo(0, j * cellSize);
        ectx.lineTo(cols * cellSize, j * cellSize);
    }
    for (let i = 0; i <= cols; i++) {
        ectx.moveTo(i * cellSize, 0);
        ectx.lineTo(i * cellSize, rows * cellSize);
    }
    ectx.stroke();

    // Entities
    const centerX = (i) => i * cellSize + cellSize / 2;
    const centerY = (j) => j * cellSize + cellSize / 2;

    if (customMapData.spawn) {
        ectx.fillStyle = '#00ffff';
        ectx.beginPath(); ectx.arc(centerX(customMapData.spawn.i), centerY(customMapData.spawn.j), cellSize / 4, 0, Math.PI * 2); ectx.fill();
        ectx.strokeStyle = '#fff'; ectx.lineWidth = 2; ectx.stroke();
    }
    if (customMapData.goal) {
        ectx.fillStyle = '#ff00ff';
        ectx.beginPath(); ectx.arc(centerX(customMapData.goal.i), centerY(customMapData.goal.j), cellSize / 4, 0, Math.PI * 2); ectx.fill();
        ectx.strokeStyle = '#fff'; ectx.lineWidth = 2; ectx.stroke();
    }
    customMapData.creatures.forEach(en => {
        ectx.fillStyle = (en.type && en.type.startsWith('cc_')) ? '#00ff00' : '#ff0000';
        ectx.beginPath(); ectx.arc(centerX(en.i), centerY(en.j), cellSize / 6, 0, Math.PI * 2); ectx.fill();
        ectx.strokeStyle = '#fff'; ectx.lineWidth = 1; ectx.stroke();
    });

    if (customMapData.props) {
        customMapData.props.forEach(p => {
            const cx = centerX(p.i);
            const cy = centerY(p.j);
            ectx.beginPath();
            if (p.type === 'light') {
                ectx.fillStyle = '#ffff00'; ectx.arc(cx, cy, cellSize / 6, 0, Math.PI * 2);
            } else if (p.type === 'pillar') {
                ectx.fillStyle = '#888888'; ectx.rect(cx - cellSize / 6, cy - cellSize / 6, Math.max(2, cellSize / 3), Math.max(2, cellSize / 3));
            } else if (p.type === 'stair') {
                ectx.fillStyle = '#ff8800';
                ectx.moveTo(cx, cy - cellSize / 4); ectx.lineTo(cx + cellSize / 4, cy + cellSize / 4); ectx.lineTo(cx - cellSize / 4, cy + cellSize / 4); ectx.lineTo(cx, cy - cellSize / 4);
            } else if (p.type === 'cube') {
                ectx.fillStyle = '#0088ff'; ectx.rect(cx - cellSize / 6, cy - cellSize / 6, Math.max(2, cellSize / 3), Math.max(2, cellSize / 3));
            } else if (p.type === 'ball') {
                ectx.fillStyle = '#00ff88'; ectx.arc(cx, cy, cellSize / 6, 0, Math.PI * 2);
            } else if (p.type.startsWith('custom_')) {
                // Pink diamond for custom GLB props
                ectx.fillStyle = '#ff44cc';
                const r = Math.max(2, cellSize / 5);
                ectx.moveTo(cx, cy - r); ectx.lineTo(cx + r, cy); ectx.lineTo(cx, cy + r); ectx.lineTo(cx - r, cy);
            }
            ectx.fill();
            ectx.strokeStyle = '#fff'; ectx.lineWidth = 1; ectx.stroke();
        });
    }

    // Draw Walls
    for (const cell of editGrid) {
        // Simple Culling
        const x = cell.i * cellSize;
        const y = cell.j * cellSize;
        if (x + cellSize + editorOffsetX < 0 || x + editorOffsetX > editorCanvas.width ||
            y + cellSize + editorOffsetY < 0 || y + editorOffsetY > editorCanvas.height) continue;

        drawCellWalls(cell, cellSize);
    }

    // Hover Highlight & Preview
    if (hoveredEdge && !dragStart) {
        const { i, j, idx } = hoveredEdge;
        const x = i * cellSize;
        const y = j * cellSize;

        // Ghost Preview
        const typeMap = { wall: 1, door: 2, window: 3, eraser: 0 };
        const type = typeMap[editorTool];
        if (type !== undefined) {
            ectx.globalAlpha = 0.5;
            drawWallSegment(x, y, cellSize, idx, type);
            ectx.globalAlpha = 1.0;
        }

        // Selection Glow
        ectx.strokeStyle = '#0f0';
        ectx.lineWidth = 2;
        ectx.shadowBlur = 10;
        ectx.shadowColor = '#0f0';
        drawWallLine(x, y, cellSize, idx);
        ectx.shadowBlur = 0;
    }

    // Drag Preview
    if (dragStart && dragEnd) {
        const i1 = Math.min(dragStart.i, dragEnd.i);
        const j1 = Math.min(dragStart.j, dragEnd.j);
        const i2 = Math.max(dragStart.i, dragEnd.i);
        const j2 = Math.max(dragStart.j, dragEnd.j);
        const color = (editorTool === 'maze') ? 'rgba(0, 100, 255, 0.6)' : 'rgba(0, 255, 0, 0.6)';
        const bg = (editorTool === 'maze') ? 'rgba(0, 100, 255, 0.1)' : 'rgba(0, 255, 0, 0.1)';
        ectx.strokeStyle = color;
        ectx.lineWidth = 2;
        ectx.strokeRect(i1 * cellSize, j1 * cellSize, (i2 - i1 + 1) * cellSize, (j2 - j1 + 1) * cellSize);
        ectx.fillStyle = bg;
        ectx.fillRect(i1 * cellSize, j1 * cellSize, (i2 - i1 + 1) * cellSize, (j2 - j1 + 1) * cellSize);
    }

    ectx.restore();
}

function drawCellWalls(cell, cellSize) {
    const x = cell.i * cellSize;
    const y = cell.j * cellSize;
    cell.walls.forEach((type, idx) => {
        if (type === 0) return;
        drawWallSegment(x, y, cellSize, idx, type);
    });
}

function drawWallSegment(x, y, cellSize, idx, type) {
    const wallColors = [null, '#fff', '#ff0', '#0ff'];
    const lineWidths = [0, 4, 8, 8];
    ectx.strokeStyle = wallColors[type];
    ectx.lineWidth = lineWidths[type];
    ectx.lineCap = 'butt';
    drawWallLine(x, y, cellSize, idx);
}

function drawWallLine(x, y, cellSize, idx) {
    ectx.beginPath();
    if (idx === 0) { ectx.moveTo(x, y); ectx.lineTo(x + cellSize, y); }
    if (idx === 1) { ectx.moveTo(x + cellSize, y); ectx.lineTo(x + cellSize, y + cellSize); }
    if (idx === 2) { ectx.moveTo(x + cellSize, y + cellSize); ectx.lineTo(x, y + cellSize); }
    if (idx === 3) { ectx.moveTo(x, y + cellSize); ectx.lineTo(x, y); }
    ectx.stroke();
}

editorCanvas.addEventListener('mousedown', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.button === 2 || e.button === 1) { // Right or Middle click
        isPanning = true;
        lastMousePos = { x: e.clientX, y: e.clientY };
        return;
    }

    const cellSize = editorZoom;
    const gx = (mx - editorOffsetX) / cellSize;
    const gy = (my - editorOffsetY) / cellSize;
    const i = Math.floor(gx);
    const j = Math.floor(gy);

    if (i < 0 || i >= cols || j < 0 || j >= rows) return;

    if (['room', 'maze'].includes(editorTool)) {
        dragStart = { i, j };
        dragEnd = { i, j };
    } else {
        const relX = (gx % 1) * cellSize;
        const relY = (gy % 1) * cellSize;
        applyTool(i, j, relX, relY, cellSize);
    }
});

editorCanvas.addEventListener('mousemove', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);

    if (isPanning) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        editorOffsetX += dx;
        editorOffsetY += dy;
        lastMousePos = { x: e.clientX, y: e.clientY };
        drawEditor();
        return;
    }

    const cellSize = editorZoom;
    const gx = (mx - editorOffsetX) / cellSize;
    const gy = (my - editorOffsetY) / cellSize;

    if (dragStart) {
        const ni = Math.max(0, Math.min(cols - 1, Math.floor(gx)));
        const nj = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
        if (ni !== dragEnd.i || nj !== dragEnd.j) {
            dragEnd = { i: ni, j: nj };
            drawEditor();
        }
    } else {
        const i = Math.floor(gx);
        const j = Math.floor(gy);
        if (i >= 0 && i < cols && j >= 0 && j < rows) {
            const relX = (gx % 1) * cellSize;
            const relY = (gy % 1) * cellSize;

            // Calculate closest edge
            const dists = [relY, cellSize - relX, cellSize - relY, relX];
            let minDist = Infinity;
            let bestIdx = 0;
            dists.forEach((d, idx) => {
                if (d < minDist) { minDist = d; bestIdx = idx; }
            });

            if (minDist < cellSize * 0.4) {
                hoveredEdge = { i, j, idx: bestIdx };
            } else {
                hoveredEdge = null;
            }
        } else {
            hoveredEdge = null;
        }
        drawEditor();
    }
});

editorCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = editorCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Grid position before zoom
    const cellSize = editorZoom;
    const gx = (mx - editorOffsetX) / cellSize;
    const gy = (my - editorOffsetY) / cellSize;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    editorZoom *= delta;

    // Bounds check for zoom
    if (editorZoom < 10) editorZoom = 10;
    if (editorZoom > 300) editorZoom = 300;

    // Offset update to keep gx, gy at the same mx, my
    editorOffsetX = mx - gx * editorZoom;
    editorOffsetY = my - gy * editorZoom;

    drawEditor();
}, { passive: false });

editorCanvas.addEventListener('dblclick', () => {
    resetView();
});

editorCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        return;
    }
    if (dragStart) {
        if (editorTool === 'room') applyRoom(dragStart, dragEnd);
        if (editorTool === 'maze') applyMaze(dragStart, dragEnd);
        dragStart = null; dragEnd = null;
        saveHistory(); drawEditor();
    }
});

function applyRoom(start, end) {
    const i1 = Math.min(start.i, end.i), i2 = Math.max(start.i, end.i);
    const j1 = Math.min(start.j, end.j), j2 = Math.max(start.j, end.j);
    for (let j = j1; j <= j2; j++) {
        for (let i = i1; i <= i2; i++) {
            editGrid[j * cols + i].walls = [0, 0, 0, 0];
            if (j === j1) setSingleWall(i, j, 0, 1);
            if (i === i2) setSingleWall(i, j, 1, 1);
            if (j === j2) setSingleWall(i, j, 2, 1);
            if (i === i1) setSingleWall(i, j, 3, 1);
        }
    }
}

function applyMaze(start, end) {
    const i1 = Math.min(start.i, end.i), i2 = Math.max(start.i, end.i);
    const j1 = Math.min(start.j, end.j), j2 = Math.max(start.j, end.j);

    // Clear walls in range and prepare
    for (let j = j1; j <= j2; j++) {
        for (let i = i1; i <= i2; i++) {
            const cell = editGrid[j * cols + i];
            cell.walls = [1, 1, 1, 1]; // All solid
            cell._mazeVisited = false;
        }
    }

    const first = editGrid[j1 * cols + i1];
    const stack = [first];
    first._mazeVisited = true;

    while (stack.length > 0) {
        const curr = stack[stack.length - 1];
        const neighbors = [];
        const dirs = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
        dirs.forEach(([di, dj, wIdx, nIdx]) => {
            const ni = curr.i + di, nj = curr.j + dj;
            if (ni >= i1 && ni <= i2 && nj >= j1 && nj <= j2) {
                const neighbor = editGrid[nj * cols + ni];
                if (!neighbor._mazeVisited) neighbors.push({ neighbor, wIdx, nIdx });
            }
        });

        if (neighbors.length > 0) {
            const { neighbor, wIdx, nIdx } = neighbors[Math.floor(Math.random() * neighbors.length)];
            curr.walls[wIdx] = 0;
            neighbor.walls[nIdx] = 0;
            neighbor._mazeVisited = true;
            stack.push(neighbor);
        } else {
            stack.pop();
        }
    }
}

function setSingleWall(i, j, wallIdx, type) {
    if (i < 0 || i >= cols || j < 0 || j >= rows) return;
    editGrid[j * cols + i].walls[wallIdx] = type;
    let ni = i, nj = j, nIdx = (wallIdx + 2) % 4;
    if (wallIdx === 0) nj--; if (wallIdx === 1) ni++; if (wallIdx === 2) nj++; if (wallIdx === 3) ni--;
    if (ni >= 0 && ni < cols && nj >= 0 && nj < rows) editGrid[nj * cols + ni].walls[nIdx] = type;
}

function applyTool(i, j, relX, relY, cellSize) {
    let changed = false;
    if (['wall', 'door', 'window', 'eraser'].includes(editorTool)) {
        if (editorTool === 'eraser') {
            const creatureBefore = customMapData.creatures.length;
            customMapData.creatures = customMapData.creatures.filter(en => !(en.i === i && en.j === j));
            if (customMapData.creatures.length !== creatureBefore) changed = true;

            const propsBefore = customMapData.props ? customMapData.props.length : 0;
            if (customMapData.props) {
                customMapData.props = customMapData.props.filter(p => !(p.i === i && p.j === j));
                if (customMapData.props.length !== propsBefore) changed = true;
            }
        }
        if (hoveredEdge) {
            const typeMap = { wall: 1, door: 2, window: 3, eraser: 0 };
            toggleWall(hoveredEdge.i, hoveredEdge.j, hoveredEdge.idx, typeMap[editorTool]);
            changed = true;
        }
    } else {
        if (editorTool === 'player' || editorTool === 'spawn') { customMapData.spawn = { i, j }; changed = true; }
        if (editorTool === 'goal') { customMapData.goal = { i, j }; changed = true; }
        if (editorTool === 'enemy' || editorTool === 'creature' || editorTool.startsWith('cc_')) {
            customMapData.creatures = customMapData.creatures.filter(c => !(c.i === i && c.j === j));
            customMapData.creatures.push({ i, j, type: editorTool.startsWith('cc_') ? editorTool : 'default' });
            changed = true;
        }
        if (['light', 'pillar', 'stair', 'cube', 'ball'].includes(editorTool) || editorTool.startsWith('custom_')) {
            if (!customMapData.props) customMapData.props = [];
            customMapData.props = customMapData.props.filter(p => !(p.i === i && p.j === j));
            customMapData.props.push({ type: editorTool, i, j });
            changed = true;
        }
    }
    if (changed) { saveHistory(); drawEditor(); }
}

function toggleWall(i, j, wallIdx, type) {
    const current = editGrid[j * cols + i].walls[wallIdx];
    const next = current === type ? 0 : type;
    setSingleWall(i, j, wallIdx, next);
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editorTool = btn.dataset.tool;
    });
});

document.getElementById('editor-undo').onclick = undo;
document.getElementById('editor-redo').onclick = redo;
document.getElementById('editor-clear').onclick = () => { editGrid.forEach(c => c.walls = [0, 0, 0, 0]); customMapData.creatures = []; saveHistory(); drawEditor(); };

document.getElementById('env-enemy-pass-doors').addEventListener('change', (e) => {
    envParams.enemyCanPassDoors = e.target.checked;
});

document.getElementById('env-enemy-ai-mode').addEventListener('change', (e) => {
    envParams.enemyAiMode = e.target.value;
    // Notify enemies to update their state if necessary
    enemies.forEach(en => {
        if (en.state === 'WANDER' || en.state === 'IDLE') {
            en.state = envParams.enemyAiMode === 'idle' ? 'IDLE' : 'WANDER';
            if (en.state === 'IDLE') en.path = [];
        }
    });
});

document.getElementById('asset-floor').onchange = (e) => loadTex(e, 'floor');
document.getElementById('asset-wall').onchange = (e) => loadTex(e, 'wall');
document.getElementById('asset-ceil').onchange = (e) => loadTex(e, 'ceil');
document.getElementById('asset-pillar').onchange = (e) => loadTex(e, 'pillar');
document.getElementById('asset-creature').onchange = (e) => {
    if (e.target.files[0]) {
        if (creatureModelPath.startsWith('blob:')) URL.revokeObjectURL(creatureModelPath);
        creatureModelPath = URL.createObjectURL(e.target.files[0]);
        document.getElementById('creature-model-input').value = creatureModelPath;
        if (typeof loadViewerModel === 'function') loadViewerModel(creatureModelPath);
    }
};
document.getElementById('creature-model-input').onchange = (e) => {
    creatureModelPath = e.target.value;
    if (typeof loadViewerModel === 'function') loadViewerModel(creatureModelPath);
};

function loadTex(e, key) {
    if (e.target.files[0]) {
        if (customTextures[key].startsWith('blob:')) URL.revokeObjectURL(customTextures[key]);
        customTextures[key] = URL.createObjectURL(e.target.files[0]);
    }
}

// --- Custom GLB Props UI ---
let _customPropCounter = 0;
document.getElementById('add-custom-prop-btn').addEventListener('click', () => {
    const propId = `custom_${_customPropCounter++}`;
    const label = `PROP ${_customPropCounter}`;

    // Add tool button to the tools panel
    const toolsContainer = document.getElementById('editor-tools');
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.tool = propId;
    btn.textContent = `${label} (Node)`;
    btn.style.background = '#224';
    btn.style.color = '#aaf';
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editorTool = propId;
    });
    toolsContainer.appendChild(btn);

    // Add file input row in Custom Props panel
    const container = document.getElementById('custom-props-container');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:5px; align-items:center; background:#1a1a2e; padding:4px 6px; border-radius:3px;';

    const lbl = document.createElement('span');
    lbl.textContent = label + ':';
    lbl.style.cssText = 'color:#aaf; font-size:11px; white-space:nowrap; min-width:48px;';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
    input.style.cssText = 'flex:1; font-size:11px;';
    input.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            if (customPropModels[propId] && customPropModels[propId].startsWith('blob:'))
                URL.revokeObjectURL(customPropModels[propId]);
            customPropModels[propId] = URL.createObjectURL(e.target.files[0]);
        }
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'background:#600; color:#fff; border:none; cursor:pointer; padding:2px 6px; border-radius:2px;';
    delBtn.addEventListener('click', () => {
        if (customPropModels[propId] && customPropModels[propId].startsWith('blob:'))
            URL.revokeObjectURL(customPropModels[propId]);
        delete customPropModels[propId];
        row.remove();
        btn.remove();
        if (customMapData.props)
            customMapData.props = customMapData.props.filter(p => p.type !== propId);
        if (editorTool === propId)
            document.querySelector('.tool-btn[data-tool="wall"]').click();
        saveHistory(); drawEditor();
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(delBtn);
    container.appendChild(row);
});

// --- Custom Image Creatures UI ---
let _customCreatureCounter = 0;
document.getElementById('add-custom-creature-btn').addEventListener('click', () => {
    const creatureId = `cc_${_customCreatureCounter++}`;
    const label = `CREATURE ${_customCreatureCounter}`;

    // Add tool button to the tools panel
    const toolsContainer = document.getElementById('editor-tools');
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.tool = creatureId;
    btn.textContent = `${label} (Img)`;
    btn.style.background = '#242';
    btn.style.color = '#afa';
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        editorTool = creatureId;
    });
    toolsContainer.appendChild(btn);

    // Config object for this creature type
    customCreatureConfigs[creatureId] = { name: label, img: null, idle: null, hit: null, die: null };

    // Add UI row in Custom Creatures panel
    const container = document.getElementById('custom-creatures-container');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; flex-direction:column; gap:4px; background:#1a2e1a; padding:6px; border-radius:3px; margin-bottom:4px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #353; padding-bottom:3px;';
    header.innerHTML = `<span style="color:#afa; font-size:12px; font-weight:bold;">${label}</span>`;
    
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'background:#600; color:#fff; border:none; cursor:pointer; padding:2px 6px; border-radius:2px; font-size:10px;';
    delBtn.addEventListener('click', () => {
        delete customCreatureConfigs[creatureId];
        row.remove();
        btn.remove();
        customMapData.creatures = customMapData.creatures.filter(c => c.type !== creatureId);
        if (editorTool === creatureId) document.querySelector('.tool-btn[data-tool="wall"]').click();
        saveHistory(); drawEditor();
    });
    header.appendChild(delBtn);
    row.appendChild(header);

    const createInput = (text, key, accept) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; align-items:center; gap:5px;';
        const s = document.createElement('span');
        s.textContent = text; s.style.cssText = 'font-size:10px; color:#ccc; min-width:35px;';
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = accept; inp.style.cssText = 'flex:1; font-size:10px;';
        inp.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                if (customCreatureConfigs[creatureId][key] && customCreatureConfigs[creatureId][key].startsWith('blob:'))
                    URL.revokeObjectURL(customCreatureConfigs[creatureId][key]);
                customCreatureConfigs[creatureId][key] = URL.createObjectURL(e.target.files[0]);
            }
        });
        div.appendChild(s); div.appendChild(inp);
        return div;
    };

    row.appendChild(createInput('IMG:', 'img', 'image/*'));
    row.appendChild(createInput('IDLE:', 'idle', 'audio/*'));
    row.appendChild(createInput('HIT:', 'hit', 'audio/*'));
    row.appendChild(createInput('DIE:', 'die', 'audio/*'));
    
    container.appendChild(row);
});

// Also support custom_ tools in applyTool (already handled by the startsWith check in applyTool)

document.getElementById('env-fog').oninput = (e) => { envParams.fogDensity = parseFloat(e.target.value); updateEnv(); };
document.getElementById('env-ambient').oninput = (e) => { envParams.ambientIntensity = parseFloat(e.target.value); updateEnv(); };
document.getElementById('env-dir').oninput = (e) => { envParams.dirIntensity = parseFloat(e.target.value); updateEnv(); };

function updateEnv() { if (typeof updateEnvironmentalParams === 'function') updateEnvironmentalParams(); }

// --- 3D Viewer & Exporter Logic ---

let viewerScene, viewerCamera, viewerRenderer, viewerControls, viewerMixer;
let viewerModelRoot = null;
let viewerAnimations = [];
let viewerCurrentAction = null;
const viewerClock = new THREE.Clock();
let viewerInitialized = false;

function initViewer() {
    if (viewerInitialized) return;
    const container = document.getElementById('viewer-container');
    if (!container) return;

    viewerScene = new THREE.Scene();
    viewerScene.background = new THREE.Color(0x222222);

    viewerScene.add(new THREE.GridHelper(10, 10, 0x555555, 0x333333));
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    viewerScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    viewerScene.add(dirLight);

    viewerCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    viewerCamera.position.set(0, 2, 5);

    viewerRenderer = new THREE.WebGLRenderer({ antialias: true });
    viewerRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(viewerRenderer.domElement);

    viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.target.set(0, 1, 0);
    viewerControls.update();

    viewerModelRoot = new THREE.Group();
    viewerScene.add(viewerModelRoot);

    viewerInitialized = true;
    animateViewer();

    if (creatureModelPath) {
        loadViewerModel(creatureModelPath);
    }
}

function animateViewer() {
    requestAnimationFrame(animateViewer);
    const delta = viewerClock.getDelta();
    if (viewerMixer) {
        viewerMixer.update(delta);
        const startVal = parseFloat(document.getElementById('viewer-anim-start').value) || 0;
        const endVal = parseFloat(document.getElementById('viewer-anim-end').value) || 0.1;
        if (viewerCurrentAction) {
            let time = viewerCurrentAction.time;
            if (time < startVal) {
                viewerCurrentAction.time = startVal;
            } else if (time > endVal) {
                viewerCurrentAction.time = startVal; // loop back to start
            }
        }
    }
    viewerRenderer.render(viewerScene, viewerCamera);
}

function loadViewerModel(path) {
    if (!path || !viewerInitialized) return;

    const loader = new THREE.GLTFLoader();
    loader.load(path, (gltf) => {
        while (viewerModelRoot.children.length > 0) {
            viewerModelRoot.remove(viewerModelRoot.children[0]);
        }

        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        let scale = 1.0;
        if (size.y > 0.001) scale = 2.0 / size.y;
        model.scale.setScalar(scale);

        const bottomY = box.min.y * scale;
        model.position.y = -bottomY;

        viewerModelRoot.add(model);

        document.getElementById('viewer-rot-y').value = 0;
        document.getElementById('viewer-rot-val').innerText = '0';
        model.rotation.y = 0;

        viewerAnimations = gltf.animations || [];
        const animSection = document.getElementById('viewer-anim-section');
        const select = document.getElementById('viewer-anim-select');
        select.innerHTML = '';

        if (viewerMixer) {
            viewerMixer.stopAllAction();
            viewerMixer = null;
        }

        if (viewerAnimations.length > 0) {
            animSection.style.display = 'block';
            viewerMixer = new THREE.AnimationMixer(model);

            viewerAnimations.forEach((clip, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.innerText = clip.name || `Animation ${index}`;
                select.appendChild(opt);
            });

            select.onchange = () => playViewerAnimation(select.value);
            playViewerAnimation(0);
        } else {
            animSection.style.display = 'none';
        }
    });
}

function playViewerAnimation(index) {
    if (!viewerMixer || !viewerAnimations[index]) return;

    viewerMixer.stopAllAction();
    const clip = viewerAnimations[index];
    viewerCurrentAction = viewerMixer.clipAction(clip);
    viewerCurrentAction.play();

    const duration = clip.duration;
    const startSlider = document.getElementById('viewer-anim-start');
    const endSlider = document.getElementById('viewer-anim-end');

    startSlider.max = duration;
    startSlider.value = 0;
    document.getElementById('viewer-anim-start-val').innerText = '0.00';

    endSlider.max = duration;
    endSlider.value = duration;
    document.getElementById('viewer-anim-end-val').innerText = duration.toFixed(2);
}

document.getElementById('viewer-rot-y').addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('viewer-rot-val').innerText = val;
    if (viewerModelRoot && viewerModelRoot.children.length > 0) {
        viewerModelRoot.children[0].rotation.y = THREE.MathUtils.degToRad(val);
    }
});

document.getElementById('viewer-anim-start').addEventListener('input', (e) => {
    document.getElementById('viewer-anim-start-val').innerText = parseFloat(e.target.value).toFixed(2);
});
document.getElementById('viewer-anim-end').addEventListener('input', (e) => {
    document.getElementById('viewer-anim-end-val').innerText = parseFloat(e.target.value).toFixed(2);
});

document.getElementById('viewer-export-btn').addEventListener('click', () => {
    if (!viewerModelRoot || viewerModelRoot.children.length === 0) return;

    const exporter = new THREE.GLTFExporter();
    const modelToExport = viewerModelRoot.children[0];

    const options = {
        binary: true,
        trs: true,
    };

    if (viewerAnimations.length > 0) {
        const selectIdx = document.getElementById('viewer-anim-select').value;
        const originalClip = viewerAnimations[selectIdx];

        let startVal = parseFloat(document.getElementById('viewer-anim-start').value);
        let endVal = parseFloat(document.getElementById('viewer-anim-end').value);
        if (startVal >= endVal) endVal = startVal + 0.1;

        const fps = 30;
        const startFrame = Math.round(startVal * fps);
        const endFrame = Math.round(endVal * fps);

        const newClipName = originalClip.name ? originalClip.name + '_cropped' : 'cropped_action';
        const croppedClip = THREE.AnimationUtils.subclip(originalClip, newClipName, startFrame, endFrame, fps);

        options.animations = [croppedClip];
    }

    exporter.parse(modelToExport, (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = 'modified_creature.glb';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, options);
});

editModeBtn.onclick = () => {
    isEditMode = !isEditMode;
    if (isEditMode) {
        initEditor();
        editorOverlay.style.display = 'block';
        if (controls.isLocked) controls.unlock();
        setTimeout(initViewer, 0); // Initialize viewer when overlay shows
    } else {
        editorOverlay.style.display = 'none';
    }
};

document.getElementById('editor-close').onclick = () => { isEditMode = false; editorOverlay.style.display = 'none'; };
document.getElementById('editor-apply').onclick = () => {
    mapMode = 'custom'; isEditMode = false; editorOverlay.style.display = 'none';
    generateMaze();
};
