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

function initEditor() {
    // Sync UI with current globals
    document.getElementById('editor-cols').value = cols;
    document.getElementById('editor-rows').value = rows;
    document.getElementById('editor-enemy-size').value = enemySize;
    document.getElementById('editor-enemy-health').value = defaultEnemyHealth;

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
    
    drawEditor();
    if (historyIndex === -1) saveHistory();
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
    cols = state.width;
    rows = state.height;
    document.getElementById('editor-cols').value = cols;
    document.getElementById('editor-rows').value = rows;
}

function drawEditor() {
    const cellSize = editorCanvas.width / Math.max(cols, rows);
    ectx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

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
        ectx.beginPath(); ectx.arc(centerX(customMapData.spawn.i), centerY(customMapData.spawn.j), cellSize/4, 0, Math.PI*2); ectx.fill();
    }
    if (customMapData.goal) {
        ectx.fillStyle = '#ff00ff';
        ectx.beginPath(); ectx.arc(centerX(customMapData.goal.i), centerY(customMapData.goal.j), cellSize/4, 0, Math.PI*2); ectx.fill();
    }
    customMapData.creatures.forEach(en => {
        ectx.fillStyle = '#ff0000';
        ectx.beginPath(); ectx.arc(centerX(en.i), centerY(en.j), cellSize/6, 0, Math.PI*2); ectx.fill();
    });

    // Draw Walls
    for (const cell of editGrid) {
        const x = cell.i * cellSize;
        const y = cell.j * cellSize;
        const wallColors = [null, '#fff', '#aa0', '#33f'];
        const lineWidths = [0, 4, 6, 6];

        cell.walls.forEach((type, idx) => {
            if (type === 0) return;
            ectx.strokeStyle = wallColors[type];
            ectx.lineWidth = lineWidths[type];
            ectx.lineCap = 'round';
            ectx.beginPath();
            if (idx === 0) { ectx.moveTo(x, y); ectx.lineTo(x + cellSize, y); }
            if (idx === 1) { ectx.moveTo(x + cellSize, y); ectx.lineTo(x + cellSize, y + cellSize); }
            if (idx === 2) { ectx.moveTo(x + cellSize, y + cellSize); ectx.lineTo(x, y + cellSize); }
            if (idx === 3) { ectx.moveTo(x, y + cellSize); ectx.lineTo(x, y); }
            ectx.stroke();
        });
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
}

editorCanvas.addEventListener('mousedown', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cellSize = editorCanvas.width / Math.max(cols, rows);
    const i = Math.floor(mx / cellSize);
    const j = Math.floor(my / cellSize);
    if (i < 0 || i >= cols || j < 0 || j >= rows) return;

    if (['room', 'maze'].includes(editorTool)) {
        dragStart = { i, j };
        dragEnd = { i, j };
    } else {
        applyTool(i, j, mx % cellSize, my % cellSize, cellSize);
    }
});

editorCanvas.addEventListener('mousemove', (e) => {
    if (dragStart) {
        const rect = editorCanvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left);
        const my = (e.clientY - rect.top);
        const cellSize = editorCanvas.width / Math.max(cols, rows);
        const ni = Math.max(0, Math.min(cols - 1, Math.floor(mx / cellSize)));
        const nj = Math.max(0, Math.min(rows - 1, Math.floor(my / cellSize)));
        if (ni !== dragEnd.i || nj !== dragEnd.j) {
            dragEnd = { i: ni, j: nj };
            drawEditor();
        }
    }
});

window.addEventListener('mouseup', () => {
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
    const margin = cellSize * 0.25;
    let changed = false;
    if (['wall', 'door', 'window', 'eraser'].includes(editorTool)) {
        let type = { wall: 1, door: 2, window: 3, eraser: 0 }[editorTool];
        if (relY < margin) { toggleWall(i, j, 0, type); changed = true; }
        else if (relX > cellSize - margin) { toggleWall(i, j, 1, type); changed = true; }
        else if (relY > cellSize - margin) { toggleWall(i, j, 2, type); changed = true; }
        else if (relX < margin) { toggleWall(i, j, 3, type); changed = true; }
    } else {
        if (editorTool === 'player') { customMapData.spawn = { i, j }; changed = true; }
        if (editorTool === 'goal') { customMapData.goal = { i, j }; changed = true; }
        if (editorTool === 'enemy') { customMapData.creatures.push({ i, j }); changed = true; }
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
document.getElementById('editor-clear').onclick = () => { editGrid.forEach(c => c.walls = [0,0,0,0]); customMapData.creatures = []; saveHistory(); drawEditor(); };

document.getElementById('asset-floor').onchange = (e) => loadTex(e, 'floor');
document.getElementById('asset-wall').onchange = (e) => loadTex(e, 'wall');
document.getElementById('asset-ceil').onchange = (e) => loadTex(e, 'ceil');
document.getElementById('asset-creature').onchange = (e) => {
    if (e.target.files[0]) {
        if (creatureModelPath.startsWith('blob:')) URL.revokeObjectURL(creatureModelPath);
        creatureModelPath = URL.createObjectURL(e.target.files[0]);
        document.getElementById('creature-model-input').value = creatureModelPath;
    }
};
document.getElementById('creature-model-input').onchange = (e) => { creatureModelPath = e.target.value; };

function loadTex(e, key) {
    if (e.target.files[0]) {
        if (customTextures[key].startsWith('blob:')) URL.revokeObjectURL(customTextures[key]);
        customTextures[key] = URL.createObjectURL(e.target.files[0]);
    }
}

document.getElementById('env-fog').oninput = (e) => { envParams.fogDensity = parseFloat(e.target.value); updateEnv(); };
document.getElementById('env-ambient').oninput = (e) => { envParams.ambientIntensity = parseFloat(e.target.value); updateEnv(); };
document.getElementById('env-dir').oninput = (e) => { envParams.dirIntensity = parseFloat(e.target.value); updateEnv(); };

function updateEnv() { if (typeof updateEnvironmentalParams === 'function') updateEnvironmentalParams(); }

editModeBtn.onclick = () => {
    isEditMode = !isEditMode;
    if (isEditMode) {
        initEditor();
        editorOverlay.style.display = 'block';
        if (controls.isLocked) controls.unlock();
    } else {
        editorOverlay.style.display = 'none';
    }
};

document.getElementById('editor-close').onclick = () => { isEditMode = false; editorOverlay.style.display = 'none'; };
document.getElementById('editor-apply').onclick = () => {
    mapMode = 'custom'; isEditMode = false; editorOverlay.style.display = 'none';
    generateMaze();
};
