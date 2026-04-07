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

        if (this.passed && footprintsVisible) {
            ctx.fillStyle = footprintColor;
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

        if (type === 2 && typeof doorModel !== 'undefined' && doorModel) {
            const mesh = THREE.SkeletonUtils.clone(doorModel);
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const scale = Math.min(w / (size.x || 1), height / (size.y || 1));
            mesh.scale.setScalar(scale);

            // align bottom
            const bottomY = box.min.y * scale;
            const yPos = -bottomY;
            const dw = size.x * scale;
            const dh = size.y * scale;

            if (idx === 0) { mesh.position.set(cx, yPos, cz - w / 2); mesh.rotation.y = 0; }
            if (idx === 1) { mesh.position.set(cx + w / 2, yPos, cz); mesh.rotation.y = -Math.PI / 2; }
            if (idx === 2) { mesh.position.set(cx, yPos, cz + w / 2); mesh.rotation.y = Math.PI; }
            if (idx === 3) { mesh.position.set(cx - w / 2, yPos, cz); mesh.rotation.y = Math.PI / 2; }
            
            wallGroup.add(mesh);
            mesh.userData = { isWall: true, isDoor: true };

            const lw = (w - dw) / 2;
            const th = height - dh;
            const isHoriz = (idx === 0 || idx === 2);
            const dcz = (idx === 0) ? cz - w/2 : cz + w/2;
            const dcx = (idx === 3) ? cx - w/2 : cx + w/2;

            if (isHoriz) {
                if (lw > 0.01) {
                    this.wallMeshes[idx].push(mkWall(lw, height, thickness, cx - w/2 + lw/2, dcz));
                    this.wallMeshes[idx].push(mkWall(lw, height, thickness, cx + w/2 - lw/2, dcz));
                }
                if (th > 0.01) this.wallMeshes[idx].push(mkWall(dw, th, thickness, cx, dcz, dh + th/2));
            } else {
                if (lw > 0.01) {
                    this.wallMeshes[idx].push(mkWall(thickness, height, lw, dcx, cz - w/2 + lw/2));
                    this.wallMeshes[idx].push(mkWall(thickness, height, lw, dcx, cz + w/2 - lw/2));
                }
                if (th > 0.01) this.wallMeshes[idx].push(mkWall(thickness, th, dw, dcx, cz, dh + th/2));
            }

            return mesh;
        }

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

        const winW = w * 0.5;
        const winH = height * 0.5;
        const yCenter = height / 2;
        
        const configs = [
            { x: cx, z: cz - w / 2, r: 0 },
            { x: cx + w / 2, z: cz, r: -Math.PI/2 },
            { x: cx, z: cz + w / 2, r: Math.PI },
            { x: cx - w / 2, z: cz, r: Math.PI/2 }
        ];
        const pos = configs[idx];
        const isHoriz = (idx === 0 || idx === 2);

        let actualW = winW;
        let actualH = winH;

        if (typeof windowModel !== 'undefined' && windowModel) {
            const mesh = THREE.SkeletonUtils.clone(windowModel);
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const scale = Math.min(winW / (size.x || 1), winH / (size.y || 1));
            mesh.scale.setScalar(scale);

            actualW = size.x * scale;
            actualH = size.y * scale;

            const modelCenterY = box.getCenter(new THREE.Vector3()).y * scale;
            const yPos = yCenter - modelCenterY;

            mesh.position.set(pos.x, yPos, pos.z);
            mesh.rotation.y = pos.r;

            wallGroup.add(mesh);
            mesh.userData = { isWall: true };
            this.wallMeshes[idx].push(mesh);
        }

        const lw = (w - actualW) / 2;
        const rw = (w - actualW) / 2;
        const botH = yCenter - (actualH / 2);
        const topH = height - (yCenter + actualH / 2);

        if (isHoriz) {
            this.wallMeshes[idx].push(mkWall(lw, height, thickness, pos.x - w/2 + lw/2, pos.z));
            this.wallMeshes[idx].push(mkWall(rw, height, thickness, pos.x + w/2 - rw/2, pos.z));
            this.wallMeshes[idx].push(mkWall(actualW, botH, thickness, pos.x, pos.z, botH/2));
            this.wallMeshes[idx].push(mkWall(actualW, topH, thickness, pos.x, pos.z, height - topH/2));
        } else {
            this.wallMeshes[idx].push(mkWall(thickness, height, lw, pos.x, pos.z - w/2 + lw/2));
            this.wallMeshes[idx].push(mkWall(thickness, height, rw, pos.x, pos.z + w/2 - rw/2));
            this.wallMeshes[idx].push(mkWall(thickness, botH, actualW, pos.x, pos.z, botH/2));
            this.wallMeshes[idx].push(mkWall(thickness, topH, actualW, pos.x, pos.z, height - topH/2));
        }
    };

    this.clearMeshes = function () {
        this.wallMeshes.forEach((mArr, idx) => {
            if (Array.isArray(mArr)) {
                mArr.forEach(m => {
                    if (m && m.traverse) {
                        m.traverse(child => {
                            if (child.isMesh) {
                                if (child.geometry) child.geometry.dispose();
                                if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                                else if (child.material) child.material.dispose();
                            }
                        });
                    } else if (m && m.geometry) {
                        m.geometry.dispose();
                    }
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
    while (propsGroup.children.length > 0) {
        const c = propsGroup.children[0];
        if (c.geometry) c.geometry.dispose();
        if (c.traverse) c.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
        propsGroup.remove(c);
    }
    // Rebuild Rapier physics world from scratch to clear all stale static colliders
    // (walls, pillars) as well as dynamic bodies from previous map generation.
    dynamicBodies = [];
    if (physicsWorld && typeof RAPIER !== 'undefined') {
        physicsWorld.free();
        physicsWorld = new RAPIER.World({ x: 0, y: -20, z: 0 });

        // Re-add the static ground floor collider
        const floorCol = RAPIER.ColliderDesc.cuboid(500, 0.05, 500)
            .setTranslation(0, -0.05, 0)
            .setRestitution(0.0)
            .setFriction(0.8);
        physicsWorld.createCollider(floorCol);
    }
    if (goalMesh) { scene.remove(goalMesh); goalMesh = null; }

    // Init texture/params from editor potentially
    updateEnvironmentalParams();
    updateTexture('wall', wallMat);
    updateTexture('floor', floorMat);
    updateTexture('ceil', ceilMat);
    updateTexture('pillar', pillarMat);

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

    if (customMapData.props) {
        customMapData.props.forEach(p => {
            const px = getPosX(p.i);
            const pz = getPosZ(p.j);
            if (p.type === 'light') mkLightProp(px, w * 0.8, pz);
            else if (p.type === 'pillar') mkPillarProp(px, 0, pz, w * 0.25, w * 0.8);
            else if (p.type === 'stair') mkStairProp(px, 0, pz);
            else if (p.type === 'cube') mkCubeProp(px, 0, pz);
            else if (p.type === 'ball') mkBallProp(px, 0, pz);
            else if (p.type.startsWith('custom_')) {
                const url = customPropModels[p.type];
                if (url) mkCustomGLBProp(px, 0, pz, url);
            }
        });
    }
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
