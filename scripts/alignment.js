import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';

const PCD_PATH = '/datasets/pcd/';
const IMG_PATH = '/datasets/stitching/';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// Constants for hotspots
const MIN_HOTSPOT_DISTANCE = 0.5; // Minimum distance between hotspots

let pcdFiles = [];
let imgFiles = [];
let alignments = {};
let currentIndex = 0;
let initialTransform = null;

// Hotspot variables
let hotspots = {}; // Store hotspots for each scene
let hotspotMode = false; // Flag to indicate if we're in hotspot placement mode
let raycaster = new THREE.Raycaster();
// Configure raycaster for point clouds
raycaster.params.Points.threshold = 0.1; // Adjust this value based on point size
let mouse = new THREE.Vector2();
let hotspotMarkers = [];
let statusDiv; // Element to show current mode status

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
  
  // Setup hotspot functionality
  setupHotspotControls();
  
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
  
  // Update hotspot positions when transform changes
  updateHotspotPositions();
}

// Hotspot functionality

// Hotspot functionality
function setupHotspotControls() {
  const addHotspotBtn = document.getElementById('addHotspotBtn');
  const targetSceneSelect = document.getElementById('targetSceneSelect');
  
  // Fill target scene select dropdown
  populateTargetScenes();
  
  // Add click listener to the renderer for hotspot placement
  renderer.domElement.addEventListener('click', onSceneClick);
  
  // Add hotspot button handler
  addHotspotBtn.addEventListener('click', () => {
    // Toggle hotspot placement mode
    hotspotMode = !hotspotMode;
    
    if (hotspotMode) {
      addHotspotBtn.textContent = "Cancel Hotspot Placement";
      renderer.domElement.style.cursor = 'crosshair';
    } else {
      addHotspotBtn.textContent = "Add Hotspot";
      renderer.domElement.style.cursor = 'auto';
    }
  });
  
  // Update hotspot list when target scene changes
  targetSceneSelect.addEventListener('change', updateHotspotList);
}

function populateTargetScenes() {
  const targetSceneSelect = document.getElementById('targetSceneSelect');
  targetSceneSelect.innerHTML = '';
  
  // Add an option for each scene
  pcdFiles.forEach((file, index) => {
    if (index !== currentIndex) { // Don't allow linking to the current scene
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Scene ${index + 1}: ${imgFiles[index]}`;
      targetSceneSelect.appendChild(option);
    }
  });
}

function onSceneClick(event) {
  // Only handle clicks when pointCloud exists and in hotspot mode
  if (!pointCloud || !hotspotMode) return;
  
  // Debug info about the scene
  console.log("Camera position:", camera.position);
  console.log("Point cloud position:", pointCloud.position);
  console.log("Point cloud world position:", new THREE.Vector3().setFromMatrixPosition(pointCloud.matrixWorld));
  console.log("Point cloud geometry:", pointCloud.geometry);
  console.log("Point count:", pointCloud.geometry.attributes.position ? pointCloud.geometry.attributes.position.count : "unknown");
  
  // Calculate mouse position in normalized device coordinates
  mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
  mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
  
  // Update the picking ray with the camera and mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Calculate intersections with ONLY the point cloud, not other objects
  const intersects = raycaster.intersectObject(pointCloud, false);
  
  // Only proceed if we have a valid intersection with the point cloud
  if (intersects.length > 0 && intersects[0].object === pointCloud) {
    // Get the intersection point in world coordinates
    const position = intersects[0].point.clone();
    
    // Check if this is actually a point in the point cloud by looking at the index
    if (intersects[0].index !== undefined) {
      console.log("Clicked point world position:", position);
      console.log("Clicked point cloud index:", intersects[0].index);
      
      // Add hotspot at the exact intersection point
      addHotspot(position);
    } else {
      console.log("Clicked where no point exists in the point cloud");
      alert("Please click on an actual point in the point cloud");
    }
    
    // Exit hotspot placement mode
    hotspotMode = false;
    document.getElementById('addHotspotBtn').textContent = "Add Hotspot";
    renderer.domElement.style.cursor = 'auto';
  }
}

function addHotspot(position) {
  const targetSceneSelect = document.getElementById('targetSceneSelect');
  if (targetSceneSelect.options.length === 0) {
    alert('No target scenes available for hotspot');
    return;
  }
  
  const targetSceneIndex = parseInt(targetSceneSelect.value);
  
  // Initialize hotspots array for current scene if not exists
  if (!hotspots[currentIndex]) {
    hotspots[currentIndex] = [];
  }
  
  // Validate that position is a valid Vector3
  if (!position || typeof position.x !== 'number' || isNaN(position.x) || 
      typeof position.y !== 'number' || isNaN(position.y) || 
      typeof position.z !== 'number' || isNaN(position.z)) {
    console.error("Invalid position for hotspot:", position);
    alert('Cannot place hotspot at invalid position');
    return;
  }
  
  // Store the position in point cloud local coordinates
  // The point cloud may be transformed, so we need to account for that
  const localPos = position.clone();
  
  // If the point cloud has been transformed, convert the world position to local
  if (pcdGroup && !pcdGroup.matrix.equals(new THREE.Matrix4())) {
    const invMatrix = new THREE.Matrix4();
    invMatrix.copy(pcdGroup.matrix).invert();
    localPos.applyMatrix4(invMatrix);
    console.log("Applied inverse matrix to convert to local coordinates", localPos);
  }
  
  // Check if hotspot already exists at similar position
  const existingHotspot = hotspots[currentIndex].find(h => {
    return h.position.distanceTo(localPos) < MIN_HOTSPOT_DISTANCE;
  });
  
  if (existingHotspot) {
    alert('A hotspot already exists near this position');
    return;
  }
  
  // Create new hotspot
  const hotspot = {
    id: Date.now(), // Unique identifier
    position: localPos.clone(), // Store the local position
    targetSceneIndex: targetSceneIndex
  };
  
  console.log("Created hotspot at local position:", localPos.clone());
  
  // Add to hotspots array
  hotspots[currentIndex].push(hotspot);
  
  // Create visual marker for the hotspot
  createHotspotMarker(hotspot);
  
  // Update hotspot list in UI
  updateHotspotList();
}

function createHotspotMarker(hotspot) {
  // Convert position to world coordinates for display
  const worldPos = hotspot.position.clone();
  worldPos.applyMatrix4(pcdGroup.matrix);
  
  console.log("Creating hotspot marker at world position:", worldPos);
  
  // Create THREE.js sprite for the hotspot
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xff0000,
      sizeAttenuation: false
    })
  );
  
  // Make the sprite a reasonable size
  sprite.scale.set(0.05, 0.05, 0.05);
  
  // Position the sprite at the world position
  sprite.position.copy(worldPos);
  
  // Store hotspot ID in the sprite for reference
  sprite.userData.hotspotId = hotspot.id;
  
  // Add sprite to the scene
  scene.add(sprite);
  
  // Store reference to the sprite
  hotspotMarkers.push(sprite);
}

function updateHotspotPositions() {
  // Update visual markers when point cloud transformation changes
  if (hotspots[currentIndex]) {
    hotspots[currentIndex].forEach(hotspot => {
      // Find the corresponding marker
      const marker = hotspotMarkers.find(m => m.userData.hotspotId === hotspot.id);
      if (marker) {
        // Apply current transform to the marker
        const worldPos = hotspot.position.clone();
        
        // Transform the local position to world coordinates using current matrix
        worldPos.applyMatrix4(pcdGroup.matrix);
        
        // Update marker position
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
    
    // Add delete listeners
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
  // Remove hotspot from array
  if (hotspots[currentIndex]) {
    const index = hotspots[currentIndex].findIndex(h => h.id === hotspotId);
    if (index !== -1) {
      hotspots[currentIndex].splice(index, 1);
    }
  }
  
  // Remove visual marker
  const markerIndex = hotspotMarkers.findIndex(m => m.userData.hotspotId === hotspotId);
  if (markerIndex !== -1) {
    scene.remove(hotspotMarkers[markerIndex]);
    hotspotMarkers.splice(markerIndex, 1);
  }
  
  // Update UI
  updateHotspotList();
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
    
    // Create or update the alignment with matrix and hotspots
    if (!alignments[currentIndex]) {
      alignments[currentIndex] = {};
    }
    
    alignments[currentIndex].matrix = matArr;
    
    // Include hotspots data if they exist
    if (hotspots[currentIndex] && hotspots[currentIndex].length > 0) {
      alignments[currentIndex].hotspots = hotspots[currentIndex].map(h => ({
        position: [h.position.x, h.position.y, h.position.z],
        targetScene: h.targetSceneIndex
      }));
    }
    
    alert('Matrix and hotspots for this pair saved in memory.');
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
    // Create final output format with scene data and hotspots
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
    pairInfo.textContent = `Pair ${currentIndex + 1} / ${pairCount}: ${imgFiles[currentIndex]} + ${pcdFiles[currentIndex]}`;
    
    // Reset hotspot mode when switching pairs
    hotspotMode = false;
    if (addHotspotBtn) {
      addHotspotBtn.textContent = "Add Hotspot";
    }
    if (renderer) {
      renderer.domElement.style.cursor = 'auto';
    }
  }

  updateTransform();
  updatePairInfo();
}

async function loadPair(idx) {
  // Clear hotspot markers
  hotspotMarkers.forEach(marker => {
    scene.remove(marker);
  });
  hotspotMarkers = [];
  
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
  
  // Ensure points are visible and pickable
  if (pointCloud.material) {
    pointCloud.material.size = 0.05; // Adjust point size for better visibility
    pointCloud.material.sizeAttenuation = true; // Scale points based on distance
  }
  
  pcdGroup.add(pointCloud);
  scene.add(pcdGroup);

  // Reset sliders
  ['rotX','rotY','rotZ','transX','transY','transZ'].forEach(id => {
    document.getElementById(id).value = 0;
  });

  // Apply initial transform (if available) and reset controls
  updateTransform();
  
  // Update the target scene dropdown to exclude the current scene
  populateTargetScenes();
  
  // Restore hotspots for this scene
  if (hotspots[idx]) {
    hotspots[idx].forEach(hotspot => {
      createHotspotMarker(hotspot);
    });
  }
  
  // Update hotspot list
  updateHotspotList();
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
