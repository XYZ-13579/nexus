// --- Input Handling & Controls ---

const controls = new THREE.PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');

blocker.addEventListener('click', function () {
    if (!isEditMode) controls.lock();
});

controls.addEventListener('lock', function () {
    blocker.style.display = 'none';
    document.getElementById('edit-mode-btn').style.display = 'none';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('weapon-idle-overlay').style.display = 'flex';
    document.getElementById('options-container').style.display = 'none';
});

controls.addEventListener('unlock', function () {
    blocker.style.display = 'flex';
    document.getElementById('edit-mode-btn').style.display = 'block';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('weapon-idle-overlay').style.display = 'none';
    document.getElementById('options-container').style.display = 'block';
});

function resetInput() {
    moveState.forward = false;
    moveState.backward = false;
    moveState.left = false;
    moveState.right = false;
    velocity.set(0, 0, 0);
    autoMove = false;
    autoPath = [];
}

const onKeyDown = function (event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = true; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = true; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = true; break;
        case 'Space':
            autoMove = !autoMove;
            if (autoMove) {
                autoPath = findPath(player, goal);
                autoIndex = 0;
            }
            break;
    }
};

const onKeyUp = function (event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = false; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// Attack handling
document.addEventListener('mousedown', (e) => {
    if (controls.isLocked && e.button === 0) {
        triggerAttackEffect();
        handleAttack();
    }
});

// Height adjustment
window.addEventListener('wheel', (e) => {
    if (controls.isLocked) {
        cameraHeightOffset -= e.deltaY * 0.001;
        camera.position.y = w * 0.4 + cameraHeightOffset;
    }
});

// Options
document.getElementById('options-btn').addEventListener('click', (e) => {
    const panel = document.getElementById('options-panel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    e.stopPropagation();
});

document.getElementById('options-panel').addEventListener('click', (e) => {
    e.stopPropagation();
});

document.getElementById('apply-settings-btn').addEventListener('click', () => {
    cols = parseInt(document.getElementById('input-cols').value) || 10;
    rows = parseInt(document.getElementById('input-rows').value) || 10;
    enemyCount = parseInt(document.getElementById('input-enemy-count').value) || 10;
    defaultEnemyHealth = parseInt(document.getElementById('input-enemy-health').value) || 1;
    
    generateMaze();
    document.getElementById('options-panel').style.display = 'none';
});
