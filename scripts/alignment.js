import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';

const PCD_PATH = '/datasets/pcd/';
const IMG_PATH = '/datasets/stitching/';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

const MIN_HOTSPOT_DISTANCE = 0.5;

let pcdFiles = [];
let imgFiles = [];
let alignments = {};
let currentIndex = 0;
let initialTransform = null;

let hotspots = {};
let hotspotMode = false;
let raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.1;
let mouse = new THREE.Vector2();
let hotspotMarkers = [];

let camera, scene, renderer, controls;
let panoSphere, pointCloud;
let pcdGroup = new THREE.Group();
let isSystemUpdate = false; // Flag to track system updates vs user changes

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
  camera.position.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0.00001);
  controls.listenToKeyEvents(document.createElement('div'));

  window.addEventListener('resize', onWindowResize);

  setupControls(pairCount);
  await loadPair(currentIndex);
  
  setupHotspotControls();
  
  animate();
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
    pointCloud.material.size = scale * 0.05;
  }
  
  updateHotspotPositions();
  
  // Mark as unsaved when transforms change (but not during system updates)
  if (!isSystemUpdate && (
      document.getElementById('rotX').value !== '0' || 
      document.getElementById('rotY').value !== '0' || 
      document.getElementById('rotZ').value !== '0' ||
      document.getElementById('transX').value !== '0' ||
      document.getElementById('transY').value !== '0' ||
      document.getElementById('transZ').value !== '0' ||
      document.getElementById('scale').value !== '1')) {
    markAsUnsaved();
  }
}


function setupHotspotControls() {
  const addHotspotBtn = document.getElementById('addHotspotBtn');
  const targetSceneSelect = document.getElementById('targetSceneSelect');
  
  populateTargetScenes();
  
  renderer.domElement.addEventListener('click', onSceneClick);
  
  addHotspotBtn.addEventListener('click', () => {
    hotspotMode = !hotspotMode;
    
    if (hotspotMode) {
      addHotspotBtn.textContent = "Cancel Hotspot Placement";
      renderer.domElement.style.cursor = 'crosshair';
    } else {
      addHotspotBtn.textContent = "Add Hotspot";
      renderer.domElement.style.cursor = 'auto';
    }
  });
  
  targetSceneSelect.addEventListener('change', updateHotspotList);
}

function populateTargetScenes() {
  const targetSceneSelect = document.getElementById('targetSceneSelect');
  targetSceneSelect.innerHTML = '';
  
  pcdFiles.forEach((file, index) => {
    if (index !== currentIndex) {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Scene ${index + 1}: ${imgFiles[index]}`;
      targetSceneSelect.appendChild(option);
    }
  });
}

function onSceneClick(event) {
  if (!pointCloud || !hotspotMode) return;
  
  console.log("Camera position:", camera.position);
  console.log("Point cloud position:", pointCloud.position);
  console.log("Point cloud world position:", new THREE.Vector3().setFromMatrixPosition(pointCloud.matrixWorld));
  console.log("Point cloud geometry:", pointCloud.geometry);
  console.log("Point count:", pointCloud.geometry.attributes.position ? pointCloud.geometry.attributes.position.count : "unknown");
  
  mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
  mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObject(pointCloud, false);
  
  if (intersects.length > 0 && intersects[0].object === pointCloud) {
    const position = intersects[0].point.clone();
    
    if (intersects[0].index !== undefined) {
      console.log("Clicked point world position:", position);
      console.log("Clicked point cloud index:", intersects[0].index);
      
      addHotspot(position);
    } else {
      console.log("Clicked where no point exists in the point cloud");
      alert("Please click on an actual point in the point cloud");
    }
    
    hotspotMode = false;
    document.getElementById('addHotspotBtn').textContent = "Add Hotspot";
    renderer.domElement.style.cursor = 'auto';
  }
}

function addHotspot(position) {
  const targetSceneSelect = document.getElementById('targetSceneSelect');
  if (targetSceneSelect.options.length === 0) {
    showToast('⚠️ No target scenes available for hotspot', 'warning');
    return;
  }
  
  const targetSceneIndex = parseInt(targetSceneSelect.value);
  
  if (!hotspots[currentIndex]) {
    hotspots[currentIndex] = [];
  }
  
  if (!position || typeof position.x !== 'number' || isNaN(position.x) || 
      typeof position.y !== 'number' || isNaN(position.y) || 
      typeof position.z !== 'number' || isNaN(position.z)) {
    console.error("Invalid position for hotspot:", position);
    alert('Cannot place hotspot at invalid position');
    return;
  }
  
  const localPos = position.clone();
  
  if (pcdGroup && !pcdGroup.matrix.equals(new THREE.Matrix4())) {
    const invMatrix = new THREE.Matrix4();
    invMatrix.copy(pcdGroup.matrix).invert();
    localPos.applyMatrix4(invMatrix);
    console.log("Applied inverse matrix to convert to local coordinates", localPos);
  }
  
  const existingHotspot = hotspots[currentIndex].find(h => {
    return h.position.distanceTo(localPos) < MIN_HOTSPOT_DISTANCE;
  });
  
  if (existingHotspot) {
    alert('A hotspot already exists near this position');
    return;
  }
  
  const hotspot = {
    id: Date.now(),
    position: localPos.clone(),
    targetSceneIndex: targetSceneIndex
  };
  
  console.log("Created hotspot at local position:", localPos.clone());
  
  hotspots[currentIndex].push(hotspot);
  
  createHotspotMarker(hotspot);
  
  updateHotspotList();
  
  // Mark as unsaved when hotspot is added
  markAsUnsaved();
}

function createHotspotMarker(hotspot) {
  const worldPos = hotspot.position.clone();
  worldPos.applyMatrix4(pcdGroup.matrix);
  
  console.log("Creating hotspot marker at world position:", worldPos);
  
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xff0000,
      sizeAttenuation: false
    })
  );
  
  sprite.scale.set(0.05, 0.05, 0.05);
  
  sprite.position.copy(worldPos);
  
  sprite.userData.hotspotId = hotspot.id;
  
  scene.add(sprite);
  
  hotspotMarkers.push(sprite);
}

function updateHotspotPositions() {
  if (hotspots[currentIndex]) {
    hotspots[currentIndex].forEach(hotspot => {
      const marker = hotspotMarkers.find(m => m.userData.hotspotId === hotspot.id);
      if (marker) {
        const worldPos = hotspot.position.clone();
        
        worldPos.applyMatrix4(pcdGroup.matrix);
        
        marker.position.copy(worldPos);
        
        console.log("Updated hotspot marker position:", marker.position);
      }
    });
  }
}

function updateHotspotList() {
  const hotspotList = document.getElementById('hotspotList');
  hotspotList.innerHTML = '';
  
  if (hotspots[currentIndex] && hotspots[currentIndex].length > 0) {
    hotspots[currentIndex].forEach(hotspot => {
      const item = document.createElement('div');
      item.className = 'hotspot-item';
      
      const targetScene = hotspot.targetSceneIndex + 1;
      item.innerHTML = `
        <span>Hotspot to Scene ${targetScene}</span>
        <button class="delete-hotspot" data-id="${hotspot.id}">Delete</button>
      `;
      
      hotspotList.appendChild(item);
    });
    
    document.querySelectorAll('.delete-hotspot').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hotspotId = parseInt(e.target.dataset.id);
        deleteHotspot(hotspotId);
      });
    });
  } else {
    hotspotList.innerHTML = '<div>No hotspots for this scene</div>';
  }
}

function deleteHotspot(hotspotId) {
  if (hotspots[currentIndex]) {
    const index = hotspots[currentIndex].findIndex(h => h.id === hotspotId);
    if (index !== -1) {
      hotspots[currentIndex].splice(index, 1);
    }
  }
  
  const markerIndex = hotspotMarkers.findIndex(m => m.userData.hotspotId === hotspotId);
  if (markerIndex !== -1) {
    scene.remove(hotspotMarkers[markerIndex]);
    hotspotMarkers.splice(markerIndex, 1);
  }
  
  updateHotspotList();
  
  // Mark as unsaved when hotspot is deleted
  markAsUnsaved();
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
    isSystemUpdate = true;
    rotX.value = rotY.value = rotZ.value = 0;
    transX.value = transY.value = transZ.value = 0;
    scale.value = 1;
    updateTransform();
    resetSaveStatus();
    isSystemUpdate = false;
  });

  exportBtn.addEventListener('click', () => {
    const mat = new THREE.Matrix4();
    mat.compose(
      pcdGroup.position,
      pcdGroup.quaternion,
      pcdGroup.scale
    );
    const matArr = mat.toArray().map(n => n.toFixed(6));
    
    if (!alignments[currentIndex]) {
      alignments[currentIndex] = {};
    }
    
    alignments[currentIndex].matrix = matArr;
    
    if (hotspots[currentIndex] && hotspots[currentIndex].length > 0) {
      alignments[currentIndex].hotspots = hotspots[currentIndex].map(h => ({
        position: [h.position.x, h.position.y, h.position.z],
        targetScene: h.targetSceneIndex
      }));
    }
    
    showToast('✅ Configuration and hotspots saved to memory!', 'success');
    updateSaveStatus(true);
  });

  nextPairBtn.addEventListener('click', async () => {
    exportBtn.click();
    currentIndex++;
    if (currentIndex >= pairCount) {
      showToast('🎉 All pairs completed! Use "Download All" to save your work.', 'info', 4000);
      currentIndex = pairCount - 1;
      return;
    }
    await loadPair(currentIndex);
  });

  downloadAllBtn.addEventListener('click', () => {
    // Check if all pairs have been saved
    const totalPairs = Math.min(pcdFiles.length, imgFiles.length);
    const savedPairs = Object.keys(alignments).filter(key => alignments[key] && alignments[key].matrix).length;
    
    if (savedPairs < totalPairs) {
      const message = `Warning: Only ${savedPairs} out of ${totalPairs} pairs have been saved. Do you want to download the incomplete configuration?`;
      if (!confirm(message)) {
        return;
      }
      showToast(`⚠️ Downloaded incomplete configuration (${savedPairs}/${totalPairs} pairs)`, 'warning', 4000);
    } else {
      showToast('✅ Downloaded complete configuration for all pairs!', 'success');
    }
    
    const finalOutput = [];
    
    for (let i = 0; i < Math.min(pcdFiles.length, imgFiles.length); i++) {
      const sceneData = {
        image: `public${IMG_PATH}${imgFiles[i]}`,
        pcd: `public${PCD_PATH}${pcdFiles[i]}`
      };
      
      if (alignments[i] && alignments[i].matrix) {
        sceneData.matrix = alignments[i].matrix;
      }
      
      if (alignments[i] && alignments[i].hotspots) {
        sceneData.hotspots = alignments[i].hotspots;
      }
      
      finalOutput.push(sceneData);
    }
    
    const blob = new Blob([JSON.stringify(finalOutput, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alignments.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  function updatePairInfo() {
    pairInfo.innerHTML = `<h2>Pair ${currentIndex + 1} / ${pairCount}</h2>`;
    pairInfo.innerHTML += `<div style="display: flex; align-items: center; margin-bottom: 0.5rem;"><span style="margin-right: 0.5rem; font-size: 1.2em;">🖼️</span> ${imgFiles[currentIndex]}</div>`;
    pairInfo.innerHTML += `<div style="display: flex; align-items: center;"><span style="margin-right: 0.5rem; font-size: 1.2em;">🌐</span> ${pcdFiles[currentIndex]}</div>`;


    hotspotMode = false;
    if (addHotspotBtn) {
      addHotspotBtn.textContent = "✚ Add hotspot";
    }
    if (renderer) {
      renderer.domElement.style.cursor = 'auto';
    }
    
    // Check if current pair has saved configuration
    if (alignments[currentIndex] && alignments[currentIndex].matrix) {
      updateSaveStatus(true);
    } else {
      updateSaveStatus(false);
    }
  }

  updateTransform();
  updatePairInfo();
}

async function loadPair(idx) {
  hotspotMarkers.forEach(marker => {
    scene.remove(marker);
  });
  hotspotMarkers = [];
  
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

  const panoTexture = await new THREE.TextureLoader().loadAsync(IMG_PATH + image);
  panoSphere = new THREE.Mesh(
    new THREE.SphereGeometry(50, 60, 40).scale(-1, 1, 1),
    new THREE.MeshBasicMaterial({ map: panoTexture })
  );
  scene.add(panoSphere);

  const pcdLoader = new PCDLoader();
  pointCloud = await pcdLoader.loadAsync(PCD_PATH + pcd);
  
  if (pointCloud.material) {
    pointCloud.material.size = 0.05;
    pointCloud.material.sizeAttenuation = true;
  }
  
  pcdGroup.add(pointCloud);
  scene.add(pcdGroup);

  isSystemUpdate = true;
  ['rotX','rotY','rotZ','transX','transY','transZ'].forEach(id => {
    document.getElementById(id).value = 0;
  });

  updateTransform();
  isSystemUpdate = false;
  
  populateTargetScenes();
  
  if (hotspots[idx]) {
    hotspots[idx].forEach(hotspot => {
      createHotspotMarker(hotspot);
    });
  }
  
  updateHotspotList();
  resetSaveStatus();
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

// Toast notification system
function showToast(message, type = 'success', duration = 3000) {
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create new toast
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Show toast with animation
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Hide toast after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Function to update save status indicator
function updateSaveStatus(saved = false) {
  const indicator = document.getElementById('saveStatus');
  if (indicator) {
    if (saved) {
      indicator.classList.add('saved');
    } else {
      indicator.classList.remove('saved');
    }
  }
}

// Reset save status when loading a new pair or resetting
function resetSaveStatus() {
  updateSaveStatus(false);
}

// Mark as unsaved when changes are made
function markAsUnsaved() {
  updateSaveStatus(false);
}