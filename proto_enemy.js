// --- Enemy Class & Spawning ---

function fixMaterial(mat) {
    const maps = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
    maps.forEach(mapName => {
        if (mat[mapName]) {
            mat[mapName].encoding = THREE.sRGBEncoding;
            mat[mapName].needsUpdate = true;
        }
    });
    mat.needsUpdate = true;
}

let currentLoadingPath = null;
function loadCreatureModel(path) {
    if (currentLoadingPath === path) return;
    currentLoadingPath = path;

    gltfLoader.load(path, (gltf) => {
        enemyModel = gltf.scene;
        enemyAnimations = gltf.animations;
        enemyModel.traverse((child) => {
            if (child.isMesh || child.isSkinnedMesh) {
                child.visible = true;
                child.frustumCulled = false;

                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => {
                        const mat = m.clone();
                        fixMaterial(mat);
                        return mat;
                    });
                } else if (child.material) {
                    child.material = child.material.clone();
                    fixMaterial(child.material);
                }
            }
        });
        console.log(`Model ${path} loaded successfully.`);
        lastLoadedCreaturePath = path;
        currentLoadingPath = null;
        spawnEnemies();
    }, undefined, (error) => {
        console.warn(`GLB ${path} not found, using red cubes`, error);
        enemyModel = null;
        enemyAnimations = [];
        currentLoadingPath = null;
        spawnEnemies();
    });
}

loadCreatureModel(creatureModelPath);

document.getElementById('creature-model-input').addEventListener('change', (e) => {
    creatureModelPath = e.target.value;
    loadCreatureModel(creatureModelPath);
});

class Enemy {
    constructor(i, j) {
        this.i = i;
        this.j = j;
        this.prevI = i;
        this.prevJ = j;
        this.health = defaultEnemyHealth;
        this.id = Math.random().toString(36).substr(2, 9);
        this.mesh = null;
        this.mixer = null;
        this.actions = {};
        this.state = 'WANDER';
        this.path = [];
        this.moveProgress = 0;
        this.speed = (enemyBaseSpeed + Math.random() * 0.5) * w; // Speed in units per second
        this.attackCooldown = 0;
        this.pathTimer = 0;
        this.radius = w * 0.25 * enemySize;

        if (enemyModel) {
            this.mesh = enemyModel.clone();
            this.mesh.visible = true;
            const box = new THREE.Box3().setFromObject(this.mesh);
            const size = box.getSize(new THREE.Vector3());
            const targetHeight = w * 0.8;
            let scale = 1.0;
            if (size.y > 0.001) scale = targetHeight / size.y;
            else scale = targetHeight / 2.0;

            const finalScale = scale * enemySize;
            this.mesh.scale.set(finalScale, finalScale, finalScale);
            const bottomY = box.min.y * finalScale;
            this.mesh.position.set(getPosX(i), -bottomY, getPosZ(j));

            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.visible = true;
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => {
                            const mat = m.clone();
                            fixMaterial(mat);
                            return mat;
                        });
                    } else if (child.material) {
                        child.material = child.material.clone();
                        fixMaterial(child.material);
                    }
                    child.userData = { isEnemy: true, enemyId: this.id };
                }
            });

            if (enemyAnimations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.mesh);
                enemyAnimations.forEach(clip => {
                    const action = this.mixer.clipAction(clip);
                    this.actions[clip.name.toLowerCase()] = action;
                });
                const idleActions = ['idle', 'stand', 'wait'];
                let played = false;
                for (let name of idleActions) {
                    if (this.actions[name]) { this.actions[name].play(); played = true; break; }
                }
                if (!played && enemyAnimations[0]) this.mixer.clipAction(enemyAnimations[0]).play();
            }
        } else {
            const geometry = new THREE.BoxGeometry(w * 0.4, w * 0.7, w * 0.4);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.scale.set(enemySize, enemySize, enemySize);
            this.mesh.position.set(getPosX(i), w * 0.35 * enemySize, getPosZ(j));
            this.mesh.userData = { isEnemy: true, enemyId: this.id };
        }
        scene.add(this.mesh);
    }

    update(delta) {
        if (!this.mesh) return;
        if (this.mixer) this.mixer.update(delta);
        if (this.attackCooldown > 0) this.attackCooldown -= delta;
        if (this.pathTimer > 0) this.pathTimer -= delta;

        const camPos = controls.getObject().position;
        const playerCellI = Math.floor((camPos.x + cols * w / 2) / w);
        const playerCellJ = Math.floor((camPos.z + rows * w / 2) / w);

        const dxP = this.mesh.position.x - camPos.x;
        const dzP = this.mesh.position.z - camPos.z;
        const distToPlayerSq = dxP * dxP + dzP * dzP;
        const attackDistSq = (w * 0.6) * (w * 0.6);

        if (distToPlayerSq < attackDistSq && this.attackCooldown <= 0) {
            this.state = 'ATTACK';
            this.attackPlayer();
        } else if (distToPlayerSq < (w * enemySearchRange) * (w * enemySearchRange)) {
            this.state = 'CHASE';
        } else {
            this.state = 'WANDER';
        }

        if (this.state === 'CHASE' || this.state === 'WANDER' || (this.state === 'ATTACK' && this.attackCooldown > 0)) {
            // Fetch next cell if arrived or no path
            if (this.path.length === 0 || this.moveProgress >= 0.95) {
                if (this.path.length > 0) this.path.shift();

                if (this.state === 'CHASE') {
                    if (this.path.length === 0 || this.pathTimer <= 0) {
                        this.path = findPath(this, { i: playerCellI, j: playerCellJ });
                        if (this.path.length > 0 && this.path[0].i === this.i && this.path[0].j === this.j) this.path.shift();
                        this.pathTimer = 1.0;
                    }
                } else {
                    const currentCell = grid[index(this.i, this.j)];
                    const available = [];
                    if (currentCell) {
                        const isPassable = (type) => type === 0 || type === 2;
                        if (isPassable(currentCell.walls[0]) && index(this.i, this.j - 1) !== -1) available.push(grid[index(this.i, this.j - 1)]);
                        if (isPassable(currentCell.walls[1]) && index(this.i + 1, this.j) !== -1) available.push(grid[index(this.i + 1, this.j)]);
                        if (isPassable(currentCell.walls[2]) && index(this.i, this.j + 1) !== -1) available.push(grid[index(this.i, this.j + 1)]);
                        if (isPassable(currentCell.walls[3]) && index(this.i - 1, this.j) !== -1) available.push(grid[index(this.i - 1, this.j)]);
                    }
                    if (available.length > 0) this.path = [available[Math.floor(Math.random() * available.length)]];
                }
                this.moveProgress = 0;
                this.prevI = this.i;
                this.prevJ = this.j;
            }

            // Delta-based movement with collision
            if (this.path.length > 0) {
                const next = this.path[0];
                const targetX = getPosX(next.i);
                const targetZ = getPosZ(next.j);

                const dx = targetX - this.mesh.position.x;
                const dz = targetZ - this.mesh.position.z;
                const distTotal = Math.sqrt(dx * dx + dz * dz);

                if (distTotal > 0.1) {
                    const moveStep = delta * this.speed;
                    const vx = (dx / distTotal) * moveStep;
                    const vz = (dz / distTotal) * moveStep;

                    const nextX = this.mesh.position.x + vx;
                    const nextZ = this.mesh.position.z + vz;

                    if (!isColliding(nextX, nextZ, this.radius)) {
                        this.mesh.position.x = nextX;
                        this.mesh.position.z = nextZ;
                    } else {
                        // Slide
                        if (!isColliding(nextX, this.mesh.position.z, this.radius)) this.mesh.position.x = nextX;
                        else if (!isColliding(this.mesh.position.x, nextZ, this.radius)) this.mesh.position.z = nextZ;
                    }

                    // Update internal cell index and progress based on new position
                    this.i = Math.floor((this.mesh.position.x + cols * w / 2) / w);
                    this.j = Math.floor((this.mesh.position.z + rows * w / 2) / w);

                    const startX = getPosX(this.prevI);
                    const startZ = getPosZ(this.prevJ);
                    const dFromStart = Math.sqrt(Math.pow(this.mesh.position.x - startX, 2) + Math.pow(this.mesh.position.z - startZ, 2));
                    this.moveProgress = dFromStart / w;
                } else {
                    this.moveProgress = 1.0;
                    this.i = next.i;
                    this.j = next.j;
                }

                const lookAtPos = new THREE.Vector3(targetX, this.mesh.position.y, targetZ);
                this.mesh.lookAt(lookAtPos);

                if (this.mixer) {
                    const walkActions = ['walk', 'run', 'move'];
                    let played = false;
                    for (let name of walkActions) {
                        if (this.actions[name]) {
                            if (!this.actions[name].isRunning()) {
                                Object.values(this.actions).forEach(a => a.stop());
                                this.actions[name].play();
                            }
                            played = true;
                            break;
                        }
                    }
                    if (!played && enemyAnimations.length > 0) {
                        const firstAction = enemyAnimations[0].name.toLowerCase();
                        if (this.actions[firstAction] && !this.actions[firstAction].isRunning()) {
                            Object.values(this.actions).forEach(a => a.stop());
                            this.actions[firstAction].play();
                        }
                    }
                }
            }
        }
    }

    attackPlayer() {
        if (player.health <= 0) return;
        this.attackCooldown = 2.0;
        player.health -= 20;
        updateHealthHud();
        flashDamageOverlay();
        if (sounds.playerDamage) {
            const s = sounds.playerDamage.cloneNode();
            s.volume = volumeSettings.sfx * volumeSettings.master * 1.5;
            s.play().catch(() => { });
        }
        const attackNames = ['attack', 'hit', 'bite', 'slash'];
        let played = false;
        for (let name of attackNames) {
            if (this.actions[name]) {
                Object.values(this.actions).forEach(a => a.stop());
                this.actions[name].reset().play();
                played = true;
                break;
            }
        }
        if (player.health <= 0) {
            player.health = 0;
            updateHealthHud();
            showDeathScreen();
        }
    }

    takeDamage() {
        if (this.health <= 0) return;
        this.health--;
        this.state = 'CHASE';
        this.pathTimer = 0;
        if (sounds.creatureDamage) {
            const s = sounds.creatureDamage.cloneNode();
            s.volume = volumeSettings.sfx * volumeSettings.master * 1.5;
            s.play().catch(() => { });
        }
        this.mesh.traverse((child) => {
            if (child.isMesh && child.material && child.material.emissive) {
                if (!child.userData.origEmissive) child.userData.origEmissive = child.material.emissive.getHex();
                child.material.emissive.setHex(0xffffff);
            }
        });
        setTimeout(() => {
            if (this.mesh) {
                this.mesh.traverse((child) => {
                    if (child.isMesh && child.material && child.material.emissive) {
                        child.material.emissive.setHex(child.userData.origEmissive || 0x000000);
                    }
                });
            }
        }, 100);
        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    die(silent = false) {
        if (!silent && sounds.zombieDeath) {
            const s = sounds.zombieDeath.cloneNode();
            s.volume = volumeSettings.sfx * volumeSettings.master * 1.5;
            s.play().catch(() => { });
        }
        scene.remove(this.mesh);
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
        const idx = enemies.indexOf(this);
        if (idx > -1) enemies.splice(idx, 1);
    }
}

function spawnEnemies() {
    while (enemies.length > 0) enemies[0].die(true);
    enemies.length = 0;

    if (!enemyModel || lastLoadedCreaturePath !== creatureModelPath) {
        loadCreatureModel(creatureModelPath);
        return;
    }

    if (mapMode === 'custom') {
        customMapData.creatures.forEach(pos => {
            enemies.push(new Enemy(pos.i, pos.j));
        });
    } else {
        const emptyCells = grid.filter(c => {
            const distToPlayer = Math.abs(c.i - player.i) + Math.abs(c.j - player.j);
            return distToPlayer > 8;
        });

        const count = 0;
        for (let k = 0; k < count; k++) {
            if (emptyCells.length === 0) break;
            const idx = Math.floor(Math.random() * emptyCells.length);
            const cell = emptyCells.splice(idx, 1)[0];
            enemies.push(new Enemy(cell.i, cell.j));
        }
    }
    updateHealthHud();
}
