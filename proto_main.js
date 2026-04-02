// --- Main Game Loop & Execution ---

let lastTime = performance.now();

function gameLoop() {
    requestAnimationFrame(gameLoop);
    const time = performance.now();
    let delta = (time - lastTime) / 1000;
    lastTime = time;

    if (isEditMode) return;
    if (delta > 0.1) delta = 0.1; // Cap delta to prevent explosion after pauses

    // Maze generation step (Procedural mode only)
    if (mapMode === 'procedural' && !mazeCompleted) {
        const next = current.checkNeighbors();
        if (next) {
            next.visited = true;
            stack.push(current);
            removeWalls(current, next);
            current = next;
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            mazeCompleted = true;
            console.log("Maze completed!");
            spawnEnemies();
        }
        if (mazeCompleted) {
            grid.forEach(cell => cell.renderWalls());
        }
    }

    // Player update
    if (controls.isLocked) {
        if (autoMove && autoPath.length > 0) {
            const next = autoPath[autoIndex];
            const targetX = getPosX(next.i);
            const targetZ = getPosZ(next.j);

            const dx = targetX - camera.position.x;
            const dz = targetZ - camera.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            const pr = w * 0.15;
            const moveStep = delta * 15;
            const vx = (dx / dist) * moveStep;
            const vz = (dz / dist) * moveStep;
            const nextX = camera.position.x + vx;
            const nextZ = camera.position.z + vz;

            if (dist < moveStep) {
                if (!isColliding(targetX, targetZ, pr)) {
                    camera.position.x = targetX;
                    camera.position.z = targetZ;
                    player.i = next.i;
                    player.j = next.j;
                    autoIndex++;
                    if (autoIndex >= autoPath.length) {
                        autoMove = false;
                        autoPath = [];
                    }
                }
            } else {
                if (!isColliding(nextX, nextZ, pr)) {
                    camera.position.x = nextX;
                    camera.position.z = nextZ;
                } else {
                    if (!isColliding(nextX, camera.position.z, pr)) camera.position.x = nextX;
                    else if (!isColliding(camera.position.x, nextZ, pr)) camera.position.z = nextZ;
                }
            }
        } else {
            velocity.x -= velocity.x * 12.0 * delta;
            velocity.z -= velocity.z * 12.0 * delta;

            direction.z = Number(moveState.forward) - Number(moveState.backward);
            direction.x = Number(moveState.right) - Number(moveState.left);
            direction.normalize();

            const moveSpeed = 600.0;
            if (moveState.forward || moveState.backward) velocity.z -= direction.z * moveSpeed * delta;
            if (moveState.left || moveState.right) velocity.x -= direction.x * moveSpeed * delta;

            const oldX = camera.position.x;
            const oldZ = camera.position.z;

            controls.moveRight(-velocity.x * delta);
            controls.moveForward(-velocity.z * delta);

            const pr = w * 0.15;
            if (isColliding(camera.position.x, camera.position.z, pr)) {
                if (!isColliding(camera.position.x, oldZ, pr)) {
                    camera.position.z = oldZ;
                } else if (!isColliding(oldX, camera.position.z, pr)) {
                    camera.position.x = oldX;
                } else {
                    camera.position.x = oldX;
                    camera.position.z = oldZ;
                }
            }
        }

        player.i = Math.floor((camera.position.x + cols * w / 2) / w);
        player.j = Math.floor((camera.position.z + rows * w / 2) / w);

        const currentCell = grid[index(player.i, player.j)];
        if (currentCell && !currentCell.passed) currentCell.passed = true;

        if (player.i !== prevPlayer.i || player.j !== prevPlayer.j) {
            prevPlayer = { i: player.i, j: player.j };
            if (player.i === goal.i && player.j === goal.j) {
                setTimeout(generateMaze, 500);
            }
        }
    }

    // Particle update
    for (let i = hitParticles.length - 1; i >= 0; i--) {
        const p = hitParticles[i];
        p.life -= delta;
        const positions = p.points.geometry.attributes.position.array;
        for (let j = 0; j < p.velocities.length; j++) {
            positions[j * 3] += p.velocities[j].x;
            positions[j * 3 + 1] += p.velocities[j].y;
            positions[j * 3 + 2] += p.velocities[j].z;
            p.velocities[j].y -= 0.1;
        }
        p.points.geometry.attributes.position.needsUpdate = true;
        p.points.material.opacity = p.life < 0.5 ? p.life * 2 : 1.0;
        if (p.life <= 0) {
            scene.remove(p.points);
            p.points.geometry.dispose();
            p.points.material.dispose();
            hitParticles.splice(i, 1);
        }
    }

    // Enemy update
    enemies.forEach(en => en.update(delta));

    // Audio update
    if (audioInitialized) {
        // Footsteps
        const isMoving = (controls.isLocked && (moveState.forward || moveState.backward || moveState.left || moveState.right)) || autoMove;
        if (isMoving && sounds.footsteps.paused) {
            sounds.footsteps.play().catch(() => { });
        } else if (!isMoving && !sounds.footsteps.paused) {
            sounds.footsteps.pause();
        }

        // Zombie Voice
        if (enemies.length > 0) {
            let minD2 = Infinity;
            const camPos = camera.position;
            enemies.forEach(en => {
                if (!en.mesh) return;
                const dx = en.mesh.position.x - camPos.x;
                const dz = en.mesh.position.z - camPos.z;
                const d2 = dx * dx + dz * dz;
                if (d2 < minD2) minD2 = d2;
            });
            const dist = Math.sqrt(minD2);
            const maxD = w * 5;
            let vol = 1.0 - (dist / maxD);
            if (vol < 0) vol = 0;
            sounds.zombieVoice.volume = vol * volumeSettings.sfx * volumeSettings.master * 2.5;
            if (sounds.zombieVoice.paused && vol > 0) {
                sounds.zombieVoice.play().catch(() => { });
            }
        } else {
            sounds.zombieVoice.volume = 0;
        }
    }

    drawMaze();
    renderer.render(scene, camera);
}

// Window resize handling
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialization - ensures scripts are loaded
function initGame() {
    generateMaze();
    updateHealthHud();
    gameLoop();
}

initGame();
