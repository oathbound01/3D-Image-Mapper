import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';

const PCD_PATH = '/datasets/pcd/';
const IMG_PATH = '/datasets/stitching/';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

let pcdFiles = [];
let imgFiles = [];
let alignments = {};
let currentIndex = 0;
let initialTransform = null;

let camera, scene, renderer, controls;
let panoSphere, pointCloud;
let pcdGroup = new THREE.Group();

window.addEventListener('DOMContentLoaded', init);

async function fetchFileList(dir, exts) {
  const resp = await fetch(dir + 'list.json');
  const files = await resp.json();
  if (Array.isArray(exts)) {
    return files.filter(f => exts.some(ext => f.toLowerCase().endsWith('.' + ext))).sort();
  } else {
    return files.filter(f => f.toLowerCase().endsWith(exts)).sort();
  }
}

async function init() {
  // Handle initial transform file upload
  document.getElementById('initTransformInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        // If user provides an array, take the first entry
        initialTransform = data[0];
      } else {
        initialTransform = data;
      }
      alert('Initial transformation loaded.');
      // Re-apply to current pair
      await loadPair(currentIndex);
    } catch (err) {
      alert('Failed to parse initial transformation file.');
      initialTransform = null;
    }
  });

  pcdFiles = await fetchFileList(PCD_PATH, '.pcd');
  imgFiles = await fetchFileList(IMG_PATH, IMAGE_EXTENSIONS);

  const pairCount = Math.min(pcdFiles.length, imgFiles.length);
  if (pairCount === 0) {
    alert('No PCD/image pairs found!');
    return;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 0, 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Prevent OrbitControls from listening to keyboard events
  controls.listenToKeyEvents(document.createElement('div'));

  window.addEventListener('resize', onWindowResize);

  setupControls(pairCount);
  await loadPair(currentIndex);
  animate();
}

function updateMatrixDisplay() {
  const mat = new THREE.Matrix4();
  mat.compose(
    pcdGroup.position,
    pcdGroup.quaternion,
    pcdGroup.scale
  );
  document.getElementById('matrixOutput').textContent =
    'Matrix4:\n' +
    mat.toArray().map(n => n.toFixed(6)).join(', ');
}

function updateTransform() {
  const baseQ = new THREE.Quaternion();
  if (initialTransform && initialTransform.rotationQuaternion) {
    const q = initialTransform.rotationQuaternion;
    baseQ.set(q[1], q[2], q[3], q[0]);
  }

  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(Number(document.getElementById('rotX').value)),
    THREE.MathUtils.degToRad(Number(document.getElementById('rotY').value)),
    THREE.MathUtils.degToRad(Number(document.getElementById('rotZ').value)),
    'XYZ'
  );
  const deltaQ = new THREE.Quaternion().setFromEuler(euler);

  pcdGroup.quaternion.copy(baseQ).premultiply(deltaQ);

  const baseT = new THREE.Vector3();
  if (initialTransform && initialTransform.translation) {
    const t = initialTransform.translation;
    baseT.set(t[0], t[1], t[2]);
  }

  pcdGroup.position.copy(baseT).add(new THREE.Vector3(
    Number(document.getElementById('transX').value),
    Number(document.getElementById('transY').value),
    Number(document.getElementById('transZ').value)
  ));

  const scale = Number(document.getElementById('scale').value);
  pcdGroup.scale.set(scale, scale, scale);

  if (pointCloud) {
    // Adjust point size based on scale to maintain visual consistency
    pointCloud.material.size = scale * 0.05;
  }

  updateMatrixDisplay();
}

function setupControls(pairCount) {
  const rotX = document.getElementById('rotX');
  const rotY = document.getElementById('rotY');
  const rotZ = document.getElementById('rotZ');
  const transX = document.getElementById('transX');
  const transY = document.getElementById('transY');
  const transZ = document.getElementById('transZ');
  const scale = document.getElementById('scale');
  const resetBtn = document.getElementById('resetBtn');
  const exportBtn = document.getElementById('exportBtn');
  const nextPairBtn = document.getElementById('nextPairBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const pairInfo = document.getElementById('pairInfo');

  [rotX, rotY, rotZ, transX, transY, transZ, scale].forEach(input => {
    input.addEventListener('input', updateTransform);
  });

  resetBtn.addEventListener('click', () => {
    rotX.value = rotY.value = rotZ.value = 0;
    transX.value = transY.value = transZ.value = 0;
    scale.value = 1;
    updateTransform();
  });

  exportBtn.addEventListener('click', () => {
    const mat = new THREE.Matrix4();
    mat.compose(
      pcdGroup.position,
      pcdGroup.quaternion,
      pcdGroup.scale
    );
    const matArr = mat.toArray().map(n => n.toFixed(6));
    alignments[currentIndex] = matArr;
    alert('Matrix for this pair saved in memory.');
  });

  nextPairBtn.addEventListener('click', async () => {
    exportBtn.click();
    currentIndex++;
    if (currentIndex >= pairCount) {
      alert('All pairs done!');
      currentIndex = pairCount - 1;
      return;
    }
    await loadPair(currentIndex);
  });

  downloadAllBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(alignments, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alignments.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  function updatePairInfo() {
    pairInfo.textContent = `Pair ${currentIndex + 1} / ${pairCount}: ${imgFiles[currentIndex]} + ${pcdFiles[currentIndex]}`;
  }

  updateTransform();
  updatePairInfo();
}

async function loadPair(idx) {
  // Remove old objects and dispose resources
  if (panoSphere) {
    scene.remove(panoSphere);
    if (panoSphere.geometry) panoSphere.geometry.dispose();
    if (panoSphere.material) panoSphere.material.dispose();
    panoSphere = null;
  }
  if (pcdGroup) {
    scene.remove(pcdGroup);
    pcdGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    pcdGroup = new THREE.Group();
  }

  const image = imgFiles[idx];
  const pcd = pcdFiles[idx];

  document.getElementById('pairInfo').textContent = `Pair ${idx + 1}: ${image} + ${pcd}`;

  // Load panorama
  const panoTexture = await new THREE.TextureLoader().loadAsync(IMG_PATH + image);
  panoSphere = new THREE.Mesh(
    new THREE.SphereGeometry(50, 60, 40).scale(-1, 1, 1),
    new THREE.MeshBasicMaterial({ map: panoTexture })
  );
  scene.add(panoSphere);

  // Load point cloud
  const pcdLoader = new PCDLoader();
  pointCloud = await pcdLoader.loadAsync(PCD_PATH + pcd);
  pcdGroup.add(pointCloud);
  scene.add(pcdGroup);

  // Reset sliders
  ['rotX','rotY','rotZ','transX','transY','transZ'].forEach(id => {
    document.getElementById(id).value = 0;
  });

  // Apply initial transform (if available) and reset controls
  updateTransform();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
