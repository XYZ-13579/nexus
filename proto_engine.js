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

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wallGroup = new THREE.Group();
scene.add(wallGroup);

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

function mkWall(bw, bh, bd, px, pz) {
    const mesh = new THREE.Mesh(boxGeo, wallMat);
    mesh.scale.set(bw, bh, bd);
    mesh.position.set(px, bh / 2, pz);

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
    return mesh;
}
