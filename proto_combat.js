// --- Combat, Health, & UI Effects ---
let enableBloodEffect = true;

document.addEventListener('DOMContentLoaded', () => {
    const bloodToggle = document.getElementById('env-blood');
    if (bloodToggle) {
        enableBloodEffect = bloodToggle.checked;
        bloodToggle.addEventListener('change', (e) => enableBloodEffect = e.target.checked);
    }
});


function triggerAttackEffect() {
    if (sounds.gunshot) {
        const s = sounds.gunshot.cloneNode();
        s.volume = volumeSettings.gunshot * volumeSettings.master;
        s.play().catch(e => console.error("Gunshot play error:", e));
    }
    const attackFlashOverlay = document.getElementById('attack-flash-overlay');
    attackFlashOverlay.style.display = 'flex';
    setTimeout(() => {
        attackFlashOverlay.style.display = 'none';
    }, 100);
}

function handleAttack() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        if (!obj.visible) continue;

        const isEnemy = obj.userData && obj.userData.isEnemy;
        const isWall = obj.userData && obj.userData.isWall;
        const isStatic = obj.userData && obj.userData.isStatic;

        // Walk up the parent chain to find if this is a dynamic prop
        let propNode = obj;
        let propBody = null;
        while (propNode) {
            if (propNode.userData && propNode.userData.isDynamic && propNode.userData.rigidBody) {
                propBody = propNode.userData.rigidBody;
                break;
            }
            propNode = propNode.parent;
        }

        if (propBody) {
            // Apply impulse in the direction the player is shooting
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const impulseStrength = 60;
            propBody.wakeUp();
            propBody.applyImpulse(
                {
                    x: dir.x * impulseStrength,
                    y: dir.y * impulseStrength + 5,
                    z: dir.z * impulseStrength
                },
                true
            );
            if (intersects[i].face) {
                createBulletMark(intersects[i].point, intersects[i].face.normal, obj, false);
            }
            break;
        } else if (isEnemy) {
            const enemy = enemies.find(en => en.id === obj.userData.enemyId);
            if (enemy) {
                createBloodEffect(intersects[i].point);
                if (intersects[i].face) {
                    createBulletMark(intersects[i].point, intersects[i].face.normal, obj, true);
                }
                enemy.takeDamage();
                break;
            }
        } else if (isWall || isStatic) {
            if (intersects[i].face) {
                createBulletMark(intersects[i].point, intersects[i].face.normal, obj, false);
            }
            break;
        }
    }
}

function updateHealthHud() {
    const hud = document.getElementById('health-hud');
    if (hud) {
        hud.innerText = `HP: ${player.health}`;
        if (player.health < 30) {
            hud.style.color = '#ff0000';
            hud.style.boxShadow = '0 0 15px #ff0000';
        } else {
            hud.style.color = '#ff0000';
            hud.style.boxShadow = 'none';
        }
    }
}

function flashDamageOverlay() {
    if (!enableBloodEffect) return;
    const overlay = document.getElementById('damage-overlay');
    if (overlay) {
        overlay.style.opacity = '1';
        setTimeout(() => {
            overlay.style.opacity = '0';
        }, 200);
    }
}

function showDeathScreen() {
    const deathScreen = document.getElementById('death-screen');
    if (deathScreen) {
        deathScreen.style.display = 'flex';
        if (controls) controls.unlock();
    }
}

function retryGame() {
    resetInput();
    const deathScreen = document.getElementById('death-screen');
    if (deathScreen) deathScreen.style.display = 'none';
    player.health = 100;
    updateHealthHud();
    cameraHeightOffset = 0;
    generateMaze();
    document.getElementById('blocker').style.display = 'flex';
}

function createBloodEffect(pos) {
    if (!enableBloodEffect) return;
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 2.0,
            (Math.random() * 1.5 + 0.5),
            (Math.random() - 0.5) * 2.0
        ));
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xff0000,
        size: 0.5,
        transparent: true,
        sizeAttenuation: true
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    hitParticles.push({ points, velocities, life: 1.5 });
}

function createBulletMark(point, faceNormal, hitObject, isCreature) {
    const tex = isCreature ? bulletMarkTexCreature : bulletMarkTexWall;
    if (!tex) return;

    const size = 1.0;
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });

    const mark = new THREE.Mesh(geometry, material);
    if (isCreature) {
        hitObject.updateMatrixWorld();
        const inverseMatrix = new THREE.Matrix4().copy(hitObject.matrixWorld).invert();
        const localPoint = point.clone().applyMatrix4(inverseMatrix);
        const localNormal = faceNormal.clone().normalize();
        mark.position.copy(localPoint).add(localNormal.clone().multiplyScalar(0.01));
        mark.lookAt(localPoint.clone().add(localNormal));
        hitObject.add(mark);
    } else {
        const normal = faceNormal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hitObject.matrixWorld)).normalize();
        mark.position.copy(point).add(normal.clone().multiplyScalar(0.01));
        mark.lookAt(point.clone().add(normal));
        scene.add(mark);
    }

    mark.rotateZ(Math.random() * Math.PI * 2);
    setTimeout(() => {
        if (isCreature) hitObject.remove(mark);
        else scene.remove(mark);
        geometry.dispose();
        material.dispose();
    }, 1000);
}
