// --- Maze Generation & Rendering ---

const minimap = document.getElementById('minimap');
const ctx = minimap.getContext('2d');

function Cell(i, j) {
    this.i = i;
    this.j = j;
    // 0: none, 1: wall, 2: door, 3: window
    this.walls = [1, 1, 1, 1];
    this.visited = false;
    this.passed = false;
    this.pathMesh = null;
    this.wallMeshes = [[], [], [], []]; // Array of arrays because Windows use multiple meshes

    const height = w * 0.8;
    const thickness = 2;
    const cx = getPosX(i);
    const cz = getPosZ(j);

    this.show = function () {
        const x = this.i * w;
        const y = this.j * w;

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;

        const colors = [null, '#0f0', '#ff0', '#0ff'];

        this.walls.forEach((type, idx) => {
            if (type > 0) {
                ctx.strokeStyle = colors[type];
                if (idx === 0) drawLine(x, y, x + w, y);
                if (idx === 1) drawLine(x + w, y, x + w, y + w);
                if (idx === 2) drawLine(x + w, y + w, x, y + w);
                if (idx === 3) drawLine(x, y + w, x, y);
            }
        });

        if (this.visited) {
            ctx.fillStyle = '#111';
            ctx.fillRect(x, y, w, w);
        }

        if (this.passed) {
            ctx.fillStyle = 'blue';
            ctx.fillRect(x, y, w, w);
            if (!this.pathMesh) {
                this.pathMesh = new THREE.Mesh(pathGeo, pathMat);
                this.pathMesh.rotation.x = -Math.PI / 2;
                this.pathMesh.position.set(cx, 0.05, cz);
                pathGroup.add(this.pathMesh);
            }
        }
    };

    this.renderWalls = function () {
        this.clearMeshes();
        this.walls.forEach((type, idx) => {
            if (type === 1) { // Wall
                this.wallMeshes[idx].push(this.createWallMesh(idx, 1));
            } else if (type === 2) { // Door
                const mesh = this.createWallMesh(idx, 2);
                mesh.userData.isDoor = true;
                this.wallMeshes[idx].push(mesh);
            } else if (type === 3) { // Window
                this.createWindowMeshes(idx);
            }
        });
    };

    this.createWallMesh = function (idx, type) {
        const height = w * 0.8;
        const thickness = 2;
        const cx = getPosX(this.i);
        const cz = getPosZ(this.j);
        let mesh;
        if (idx === 0) mesh = mkWall(w + thickness, height, thickness, cx, cz - w / 2);
        if (idx === 1) mesh = mkWall(thickness, height, w + thickness, cx + w / 2, cz);
        if (idx === 2) mesh = mkWall(w + thickness, height, thickness, cx, cz + w / 2);
        if (idx === 3) mesh = mkWall(thickness, height, w + thickness, cx - w / 2, cz);
        if (type === 2) mesh.material = new THREE.MeshStandardMaterial({ color: 0x8b4513, map: wallTex });
        return mesh;
    };

    this.createWindowMeshes = function (idx) {
        const height = w * 0.8;
        const thickness = 2;
        const cx = getPosX(this.i);
        const cz = getPosZ(this.j);

        const configs = [
            { x: cx, z: cz - w / 2 }, // top 
            { x: cx + w / 2, z: cz }, // right
            { x: cx, z: cz + w / 2 }, // bottom
            { x: cx - w / 2, z: cz }  // left
        ];

        const pos = configs[idx];
        const isHoriz = (idx === 0 || idx === 2);
        const winW = isHoriz ? w : thickness;
        const winD = isHoriz ? thickness : w;

        // 4 Segments: left, right, bottom (sill), top (header)
        const frameMat = wallMat;
        const gapSize = 0.5; // 50% hole

        if (isHoriz) {
            // Horizontal wall (X-axis)
            this.wallMeshes[idx].push(mkWall(winW * (1 - gapSize) / 2, height, thickness, pos.x - winW * (1 + gapSize) / 4, pos.z)); // left
            this.wallMeshes[idx].push(mkWall(winW * (1 - gapSize) / 2, height, thickness, pos.x + winW * (1 + gapSize) / 4, pos.z)); // right
            this.wallMeshes[idx].push(mkWall(winW * gapSize, height * (1 - gapSize) / 2, thickness, pos.x, pos.z, height * (1 - gapSize) / 4)); // sill (bottom)
            this.wallMeshes[idx].push(mkWall(winW * gapSize, height * (1 - gapSize) / 2, thickness, pos.x, pos.z, height * (1 + gapSize) / 4)); // header (top)
        } else {
            // Vertical wall (Z-axis)
            this.wallMeshes[idx].push(mkWall(thickness, height, winD * (1 - gapSize) / 2, pos.x, pos.z - winD * (1 + gapSize) / 4)); // back
            this.wallMeshes[idx].push(mkWall(thickness, height, winD * (1 - gapSize) / 2, pos.x, pos.z + winD * (1 + gapSize) / 4)); // front
            this.wallMeshes[idx].push(mkWall(thickness, height * (1 - gapSize) / 2, winD * gapSize, pos.x, pos.z, height * (1 - gapSize) / 4)); // sill
            this.wallMeshes[idx].push(mkWall(thickness, height * (1 - gapSize) / 2, winD * gapSize, pos.x, pos.z, height * (1 + gapSize) / 4)); // header
        }
    };

    this.clearMeshes = function () {
        this.wallMeshes.forEach((mArr, idx) => {
            if (Array.isArray(mArr)) {
                mArr.forEach(m => {
                    if (m.geometry) m.geometry.dispose();
                    wallGroup.remove(m);
                });
                this.wallMeshes[idx] = [];
            }
        });
    };
}

function generateMaze() {
    resetInput();
    grid = [];
    stack = [];

    // Clear existing
    while (wallGroup.children.length > 0) {
        const c = wallGroup.children[0];
        if (c.geometry) c.geometry.dispose();
        wallGroup.remove(c);
    }
    while (pathGroup.children.length > 0) pathGroup.remove(pathGroup.children[0]);
    if (goalMesh) { scene.remove(goalMesh); goalMesh = null; }

    // Init texture/params from editor potentially
    updateEnvironmentalParams();
    updateTexture('wall', wallMat);
    updateTexture('floor', floorMat);
    updateTexture('ceil', ceilMat);

    if (mapMode === 'custom') {
        applyCustomMap();
    } else {
        generateProceduralMap();
    }

    minimap.width = cols * w;
    minimap.height = rows * w;
}

function generateProceduralMap() {
    cols = 10;
    rows = 10;
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            grid.push(new Cell(i, j));
        }
    }

    // Convert to an empty room by removing all internal walls
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const cell = grid[j * cols + i];
            if (i > 0) cell.walls[3] = 0; // Remove left wall if not boundary
            if (i < cols - 1) cell.walls[1] = 0; // Remove right wall if not boundary
            if (j > 0) cell.walls[0] = 0; // Remove top wall if not boundary
            if (j < rows - 1) cell.walls[2] = 0; // Remove bottom wall if not boundary
            cell.renderWalls();
        }
    }

    current = grid[0];
    player = { i: 0, j: 0, health: 100 };
    goal = { i: cols - 1, j: rows - 1 };

    mazeCompleted = true;
    setupWorldAssets();
}

function applyCustomMap() {
    cols = customMapData.width;
    rows = customMapData.height;
    w = 10;

    grid = [];
    minimap.width = cols * w;
    minimap.height = rows * w;

    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const cell = new Cell(i, j);
            const dataIdx = j * cols + i;
            if (customMapData.cells[dataIdx]) {
                cell.walls = [...customMapData.cells[dataIdx].walls];
            }
            cell.renderWalls();
            grid.push(cell);
        }
    }
    player = { ...customMapData.spawn, health: 100 };
    goal = { ...customMapData.goal };
    mazeCompleted = true;
    setupWorldAssets();
}

function setupWorldAssets() {
    // Sync globals if needed
    if (mapMode === 'custom') {
        cols = customMapData.width;
        rows = customMapData.height;
    }

    // Floor/Ceil resize and repositioning
    if (floor.geometry) floor.geometry.dispose();
    floor.geometry = new THREE.PlaneGeometry(cols * w, rows * w);
    floor.position.set(0, 0, 0); // Center of grid
    if (floor.material.map) {
        floor.material.map.repeat.set(cols * textureScaleFactor, rows * textureScaleFactor);
    }

    if (ceil.geometry) ceil.geometry.dispose();
    ceil.geometry = new THREE.PlaneGeometry(cols * w, rows * w);
    ceil.position.set(0, w * 0.8, 0);
    if (ceil.material.map) {
        ceil.material.map.repeat.set(cols * textureScaleFactor, rows * textureScaleFactor);
    }

    goalMesh = new THREE.Mesh(goalGeo, goalMat);
    goalMesh.position.set(getPosX(goal.i), w * 0.4, getPosZ(goal.j));
    scene.add(goalMesh);

    const cam = controls.getObject();
    cam.position.x = getPosX(player.i);
    cam.position.z = getPosZ(player.j);
    cam.position.y = w * 0.4 + cameraHeightOffset;
    cam.rotation.set(0, 0, 0);

    spawnEnemies();
}

function removeWalls(a, b) {
    const x = a.i - b.i;
    // Update types to 0 if removed
    if (x === 1) { a.walls[3] = 0; b.walls[1] = 0; }
    else if (x === -1) { a.walls[1] = 0; b.walls[3] = 0; }
    const y = a.j - b.j;
    if (y === 1) { a.walls[0] = 0; b.walls[2] = 0; }
    else if (y === -1) { a.walls[2] = 0; b.walls[0] = 0; }

    a.renderWalls(); b.renderWalls();
}

function drawMaze() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, minimap.width, minimap.height);
    grid.forEach(cell => cell.show());

    const px = player.i * w + w / 2;
    const py = player.j * w + w / 2;
    const radius = w * 0.45;

    ctx.save();
    ctx.translate(px, py);
    const dir = new THREE.Vector3();
    controls.getDirection(dir);
    ctx.rotate(Math.atan2(dir.z, dir.x));

    ctx.beginPath();
    ctx.moveTo(radius * 1.5, 0);
    ctx.lineTo(-radius * 0.8, radius * 0.8);
    ctx.lineTo(-radius * 0.2, 0);
    ctx.lineTo(-radius * 0.8, -radius * 0.8);
    ctx.closePath();

    ctx.fillStyle = '#00ffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = 'magenta';
    ctx.beginPath();
    ctx.arc(goal.i * w + w / 2, goal.j * w + w / 2, w / 3, 0, Math.PI * 2);
    ctx.fill();

    enemies.forEach(en => {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(en.i * w + w / 2, en.j * w + w / 2, w / 4, 0, Math.PI * 2);
        ctx.fill();
    });
}
