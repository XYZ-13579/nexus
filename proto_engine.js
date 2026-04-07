// --- 3D Scene / Engine Setup ---

const scene = new THREE.Scene();
scene.background = new THREE.Color(envParams.fogColor);
scene.fog = new THREE.FogExp2(envParams.fogColor, envParams.fogDensity);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById('webgl-container').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, envParams.ambientIntensity);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffeedd, envParams.dirIntensity);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

function updateEnvironmentalParams() {
    scene.fog.density = envParams.fogDensity;
    ambientLight.intensity = envParams.ambientIntensity;
    dirLight.intensity = envParams.dirIntensity;
}


function updateTexture(key, material) {
    if (customTextures[key]) {
        textureLoader.load(customTextures[key], (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            if (key === 'floor' || key === 'ceil') {
                tex.repeat.set(cols * textureScaleFactor, rows * textureScaleFactor);
            }
            material.map = tex;
            material.needsUpdate = true;
        });
    }
}

const textureLoader = new THREE.TextureLoader();

// Materials & Mesh Groups
const wallTex = textureLoader.load('textures/wall.png');
wallTex.wrapS = THREE.RepeatWrapping;
wallTex.wrapT = THREE.RepeatWrapping;
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xaaaaaa, roughness: 0.8, metalness: 0.2 });

const pillarTex = textureLoader.load('textures/wall.png');
pillarTex.wrapS = THREE.RepeatWrapping;
pillarTex.wrapT = THREE.RepeatWrapping;
const pillarMat = new THREE.MeshStandardMaterial({ map: pillarTex, color: 0xaaaaaa, roughness: 0.8, metalness: 0.2 });

const genericPropMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.1 });

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wallGroup = new THREE.Group();
scene.add(wallGroup);

const propsGroup = new THREE.Group();
scene.add(propsGroup);

const pathGroup = new THREE.Group();
scene.add(pathGroup);
const pathMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.5 });
const pathGeo = new THREE.PlaneGeometry(w * 0.4, w * 0.4);

let goalMesh;
const goalGeo = new THREE.CylinderGeometry(w / 4, w / 4, w * 0.8, 16);
const goalMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00cc00 });

const textureScaleFactor = 2.0; // Texture repeats per cell width 'w'

// Floor & Ceiling
const floorTex = textureLoader.load('textures/floor.png');
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(cols * textureScaleFactor, rows * textureScaleFactor);
const floorGeo = new THREE.PlaneGeometry(cols * w, rows * w);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x999999, roughness: 0.9, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.userData = { isStatic: true };
scene.add(floor);

const ceilTex = textureLoader.load('天井.jpeg');
ceilTex.wrapS = THREE.RepeatWrapping;
ceilTex.wrapT = THREE.RepeatWrapping;
ceilTex.repeat.set(cols * textureScaleFactor, rows * textureScaleFactor);
const ceilGeo = new THREE.PlaneGeometry(cols * w, rows * w);
const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, color: 0xcccccc, roughness: 0.8, metalness: 0.1 });
const ceil = new THREE.Mesh(ceilGeo, ceilMat);
ceil.rotation.x = Math.PI / 2;
ceil.position.y = w * 0.8;
ceil.userData = { isStatic: true };
scene.add(ceil);

const bulletMarkTexWall = textureLoader.load('Snapshot_2.PNG');
const bulletMarkTexCreature = textureLoader.load('Snapshot_3.PNG');

// --- Rapier Physics World ---
// Initialized asynchronously in proto_main.js after RAPIER.init() resolves
let physicsWorld = null;
// Array of { mesh, body } for dynamic bodies that need Three.js sync each frame
let dynamicBodies = [];

/** Helper: create a Rapier rigid body + cuboid collider */
function mkRigidBodyBox(px, py, pz, sx, sy, sz, isDynamic) {
    if (!physicsWorld) return null;
    const desc = isDynamic
        ? RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz)
        : RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz);
    const body = physicsWorld.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
        .setRestitution(0.0)
        .setFriction(0.6);
    physicsWorld.createCollider(col, body);
    return body;
}

/** Helper: create a Rapier rigid body + ball collider */
function mkRigidBodySphere(px, py, pz, r, isDynamic) {
    if (!physicsWorld) return null;
    const desc = isDynamic
        ? RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz)
        : RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz);
    const body = physicsWorld.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.ball(r)
        .setRestitution(0.0)
        .setFriction(0.6);
    physicsWorld.createCollider(col, body);
    return body;
}

/** Sync all dynamic Three.js meshes with their Rapier bodies */
function syncPhysics() {
    if (!physicsWorld) return;
    physicsWorld.step();
    for (const { mesh, body } of dynamicBodies) {
        const t = body.translation();
        const r = body.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
}

function mkWall(bw, bh, bd, px, pz, py) {
    const mesh = new THREE.Mesh(boxGeo, wallMat);
    const finalY = py !== undefined ? py : bh / 2;
    mesh.scale.set(bw, bh, bd);
    mesh.position.set(px, finalY, pz);

    const targetScaleU = Math.max(bw, bd) / w * textureScaleFactor;
    const targetScaleV = bh / w * textureScaleFactor;
    const geom = boxGeo.clone();
    const uvAttribute = geom.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
        let u = uvAttribute.getX(i);
        let v = uvAttribute.getY(i);
        uvAttribute.setXY(i, u * targetScaleU, v * targetScaleV);
    }
    mesh.geometry = geom;

    wallGroup.add(mesh);
    mesh.userData = { isWall: true };

    // Add a matching static Rapier collider so dynamic props cannot pass through walls
    if (physicsWorld) {
        const col = RAPIER.ColliderDesc.cuboid(bw / 2, bh / 2, bd / 2)
            .setTranslation(px, finalY, pz)
            .setRestitution(0.0)
            .setFriction(0.8);
        physicsWorld.createCollider(col);
    }

    return mesh;
}

// --- Prop Generators ---

function mkLightProp(px, py, pz) {
    const group = new THREE.Group();
    group.position.set(px, py, pz);

    // Visual fixture (ceiling disc)
    const fixtureGeo = new THREE.CylinderGeometry(2, 2, 0.5, 8);
    const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x555500 });
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    group.add(fixture);

    // Light bulb glow sphere
    const bulbGeo = new THREE.SphereGeometry(1.2, 8, 8);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2.0 });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = -1.5;
    group.add(bulb);

    const light = new THREE.PointLight(0xffffee, 1.2, w * 5);
    light.position.y = -1.5;
    group.add(light);

    propsGroup.add(group);
    return group;
}

function mkPillarProp(px, py, pz, radius, height) {
    const geom = new THREE.CylinderGeometry(radius, radius, height, 16);
    const mesh = new THREE.Mesh(geom, pillarMat);
    const finalY = py + height / 2;
    mesh.position.set(px, finalY, pz);

    // Texture mapping
    const targetScaleU = (radius * 2 * Math.PI) / w * textureScaleFactor;
    const targetScaleV = height / w * textureScaleFactor;
    const uvAttribute = geom.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
        uvAttribute.setXY(i, uvAttribute.getX(i) * targetScaleU, uvAttribute.getY(i) * targetScaleV);
    }

    mesh.userData = { isWall: true, isPillar: true };
    propsGroup.add(mesh);

    // Add a static Rapier cuboid approximating the cylinder for physical blockage
    if (physicsWorld) {
        const col = RAPIER.ColliderDesc.cuboid(radius, height / 2, radius)
            .setTranslation(px, finalY, pz)
            .setRestitution(0.0)
            .setFriction(0.8);
        physicsWorld.createCollider(col);
    }

    return mesh;
}

function mkStairProp(px, py, pz) {
    const group = new THREE.Group();
    group.position.set(px, py, pz);

    const numSteps = 10;
    const stairWidth = w * 0.9;
    const stairDepth = w * 0.9;
    const totalHeight = w * 0.8; // Reaches the ceiling

    const stepDepth = stairDepth / numSteps;
    const stepHeight = totalHeight / numSteps;

    for (let i = 0; i < numSteps; i++) {
        const stepMesh = new THREE.Mesh(boxGeo, wallMat);
        const h_s = stepHeight * (i + 1);
        stepMesh.scale.set(stairWidth, h_s, stepDepth);
        // North-facing: step[0] at +Z, step[last] at -Z (North)
        const zOff = (stairDepth / 2) - stepDepth / 2 - (i * stepDepth);
        stepMesh.position.set(0, h_s / 2, zOff);
        stepMesh.userData = { isStair: true };
        group.add(stepMesh);
    }

    group.userData = { isStair: true };
    propsGroup.add(group);
    return group;
}

function mkCubeProp(px, py, pz) {
    const s = w * 0.3;
    const finalY = py + s / 2;

    const mesh = new THREE.Mesh(boxGeo, genericPropMat);
    mesh.scale.setScalar(s);
    mesh.position.set(px, finalY, pz);
    mesh.userData = { isProp: true, isDynamic: true };

    const body = mkRigidBodyBox(px, finalY, pz, s, s, s, true);
    if (body) {
        mesh.userData.rigidBody = body;
        dynamicBodies.push({ mesh, body });
    }
    propsGroup.add(mesh);
    return mesh;
}

function mkBallProp(px, py, pz) {
    const r = w * 0.15;
    const finalY = py + r;

    const geom = new THREE.SphereGeometry(r, 16, 16);
    const mesh = new THREE.Mesh(geom, genericPropMat);
    mesh.position.set(px, finalY, pz);
    mesh.userData = { isProp: true, isDynamic: true };

    const body = mkRigidBodySphere(px, finalY, pz, r, true);
    if (body) {
        mesh.userData.rigidBody = body;
        dynamicBodies.push({ mesh, body });
    }
    propsGroup.add(mesh);
    return mesh;
}

function mkCustomGLBProp(px, py, pz, glbUrl) {
    const s = w * 0.4;
    const finalY = py + s / 2;

    // Container group – its position is driven by Rapier
    const group = new THREE.Group();
    group.position.set(px, finalY, pz);
    group.userData = { isProp: true, isDynamic: true };

    // Load the GLB and parent it inside the group
    const gltfLoader = new THREE.GLTFLoader();
    gltfLoader.load(glbUrl, (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxSide = Math.max(size.x, size.y, size.z) || 1;
        const scale = s / maxSide;
        model.scale.setScalar(scale);
        const centerY = box.getCenter(new THREE.Vector3()).y * scale;
        model.position.y = -centerY;
        group.add(model);
    }, undefined, (err) => console.warn('Custom prop GLB load error:', err));

    const body = mkRigidBodyBox(px, finalY, pz, s, s, s, true);
    if (body) {
        group.userData.rigidBody = body;
        dynamicBodies.push({ mesh: group, body });
    }
    propsGroup.add(group);
    return group;
}
