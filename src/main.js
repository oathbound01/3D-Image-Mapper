import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

let camera, scene, renderer;
let controls;
let tourData = []; // Initialize as an empty array
let currentStopIndex = 0;
let activeObjects = new THREE.Group();
let hotspotObjects = new THREE.Group(); // Group for hotspot markers

const worldMatrix = new THREE.Matrix4();

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const infoDiv = document.getElementById('info');

const NAVIGATION_THRESHOLD = 1.0; // meters

// --- Hover Marker Setup ---
let hoverMarker;
function createHoverMarker() {
  const geometry = new THREE.SphereGeometry(0.15, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.7, transparent: true });
  hoverMarker = new THREE.Mesh(geometry, material);
  hoverMarker.visible = false;
  scene.add(hoverMarker);
}

// --- Click/Drag Detection ---
let mouseDownPos = null;
let mouseMoved = false;

// --- Raycaster for interactions ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

init();

async function init() {
  try {
    const response = await fetch('tour.json');
    tourData = await response.json();
  } catch (error) {
    infoDiv.textContent = "Error: Could not load tour data.";
    console.error(error);
    return;
  }

  scene = new THREE.Scene();

  // Axes Helper
  const axesHelper = new THREE.AxesHelper(2); // 2 units long
  scene.add(axesHelper);

  scene.background = new THREE.Color(0x101010);
  scene.add(activeObjects);
  scene.add(hotspotObjects);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true;
  controls.enableDamping = true;
  controls.target.set(0, 0, Number.MIN_VALUE);

  window.addEventListener('resize', onWindowResize);

  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));

  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMoveHover);
  renderer.domElement.addEventListener('mouseup', onMouseUp);

  createHoverMarker();

  if (tourData.length > 0) {
    await loadStop(0);
  } else {
    infoDiv.textContent = "No stops in tour data.";
  }

  renderer.setAnimationLoop(animate);
}

async function loadStop(index) {
  if (index < 0 || index >= tourData.length) {
    return;
  }

  currentStopIndex = index;
  // Clear previous objects
  while(activeObjects.children.length > 0){ 
    activeObjects.remove(activeObjects.children[0]); 
  }
  
  // Clear previous hotspots
  while(hotspotObjects.children.length > 0) {
    hotspotObjects.remove(hotspotObjects.children[0]);
  }
  
  const stopData = tourData[index];

  const textureLoader = new THREE.TextureLoader();
  const pcdLoader = new PCDLoader();

  infoDiv.textContent = `Loading stop ${index + 1} / ${tourData.length}...`;

  try {
    const [panoTexture, pcd] = await Promise.all([
      textureLoader.loadAsync(stopData.image),
      pcdLoader.loadAsync(stopData.pcd),
    ]);

    // Panorama sphere
    const sphereGeo = new THREE.SphereGeometry(500, 60, 40);
    sphereGeo.scale(-1, 1, 1);
    const sphereMat = new THREE.MeshBasicMaterial({ map: panoTexture });
    const panoSphere = new THREE.Mesh(sphereGeo, sphereMat);
    activeObjects.add(panoSphere);

    // Point cloud
    pcd.material.size = 0.03;
    // The transformation matrix is now loaded per stop
    const pcdMatrix = new THREE.Matrix4().fromArray(stopData.matrix);
    pcd.geometry.applyMatrix4(pcdMatrix);
    
    // Filter out points too close to origin to improve raycasting
    filterPointCloudNearOrigin(pcd, 0.3, 4); // radius: 0.3m, height: 4m

    activeObjects.add(pcd);

    // Create hotspots if they exist in this stop
    if (stopData.hotspots && stopData.hotspots.length > 0) {
      createHotspots(stopData.hotspots, pcdMatrix);
    }

    activeObjects.position.set(0, 0, 0);
    activeObjects.quaternion.set(0, 0, 0, 1);

    // Camera and controls
    camera.position.set(0, 0, 0); // Start at center of the sphere
    controls.target.set(0, 0, 0.00000001);

    updateUI();
  } catch (error) {
    infoDiv.textContent = `Error loading stop ${index + 1}.`;
    console.error(error);
  }
}

// Create hotspot markers
function createHotspots(hotspots, pcdMatrix) {
  hotspots.forEach((hotspot, idx) => {
    // Create hotspot marker
    const geometry = new THREE.SphereGeometry(0.1, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      opacity: 0.7,
      transparent: true
    });
    
    const marker = new THREE.Mesh(geometry, material);
    
    // Set position based on hotspot data
    const position = new THREE.Vector3(
      hotspot.position[0],
      hotspot.position[1],
      hotspot.position[2]
    );
    
    // Apply the PCD matrix transformation to position the hotspot correctly
    position.applyMatrix4(pcdMatrix);
    marker.position.copy(position);
    
    // Store target scene index in userData for click handling
    marker.userData = {
      type: 'hotspot',
      targetSceneIndex: hotspot.targetScene
    };
    
    // Add a pulsing effect to make hotspots more visible
    marker.name = `hotspot-${idx}`;
    
    // Add to the scene
    hotspotObjects.add(marker);
  });
}

function navigate(direction) {
  const newIndex = currentStopIndex + direction;
  loadStop(newIndex);
}

// Navigate directly to a specific scene
function navigateToScene(sceneIndex) {
  if (sceneIndex >= 0 && sceneIndex < tourData.length) {
    loadStop(sceneIndex);
    return true;
  }
  return false;
}

function updateUI() {
  infoDiv.textContent = `Stop ${currentStopIndex + 1} / ${tourData.length}`;
  prevBtn.disabled = currentStopIndex === 0;
  nextBtn.disabled = currentStopIndex === tourData.length - 1;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  controls.update();
  
  // Add a pulse effect to hotspots
  const time = Date.now() * 0.001; // Time in seconds
  hotspotObjects.children.forEach(hotspot => {
    const scale = 1 + 0.2 * Math.sin(time * 3 + parseInt(hotspot.name.split('-')[1]) * 0.5);
    hotspot.scale.set(scale, scale, scale);
  });
  
  renderer.render(scene, camera);
}

// --- Mouse Down/Up for Click Detection ---
function onMouseDown(event) {
  mouseDownPos = { x: event.clientX, y: event.clientY };
  mouseMoved = false;
}

function onMouseUp(event) {
  if (!mouseDownPos) return;
  const dx = event.clientX - mouseDownPos.x;
  const dy = event.clientY - mouseDownPos.y;
  const moveDist = Math.sqrt(dx * dx + dy * dy);
  mouseDownPos = null;

  // Only treat as click if mouse did not move significantly
  if (moveDist < 5) {
    onSceneClick(event);
  }
}

// --- Scene Click Handler (Handles both point cloud and hotspots) ---
function onSceneClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // Check for hotspot intersections
  const hotspotIntersects = raycaster.intersectObjects(hotspotObjects.children);
  if (hotspotIntersects.length > 0) {
    const hotspot = hotspotIntersects[0].object;
    if (hotspot.userData && hotspot.userData.type === 'hotspot') {
      const targetSceneIndex = hotspot.userData.targetSceneIndex;
      if (navigateToScene(targetSceneIndex)) {
        return; // Navigation handled, exit the function
      }
    }
  }
  
  // We still call handlePointCloudClick for consistency and future extensions
  handlePointCloudClick(raycaster);
}

// --- Point Cloud Click Navigation (removing front/back navigation, only keeping custom hotspots) ---
function handlePointCloudClick(raycaster) {
  raycaster.params.Points.threshold = 0.2;
  
  let pointCloud = null;
  activeObjects.traverse(obj => {
    if (obj.isPoints) pointCloud = obj;
  });
  if (!pointCloud) return;

  const intersects = raycaster.intersectObject(pointCloud);
  if (intersects.length === 0) return;

  // Point cloud was clicked but we're not doing automatic navigation anymore
  // Keep this function for future extensions if needed
}

// --- Hover Feedback Logic (only for custom hotspots) ---
function onMouseMoveHover(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // Check hotspot hover
  const hotspotIntersects = raycaster.intersectObjects(hotspotObjects.children);
  if (hotspotIntersects.length > 0) {
    const hotspot = hotspotIntersects[0].object;
    if (hotspot.userData && hotspot.userData.type === 'hotspot') {
      const targetSceneIndex = hotspot.userData.targetSceneIndex;
      
      // Show hotspot hover feedback
      hoverMarker.position.copy(hotspot.position);
      hoverMarker.visible = true;
      renderer.domElement.style.cursor = 'pointer';
      infoDiv.textContent = `Go to Scene ${targetSceneIndex + 1}`;
      return;
    }
  }
  
  // Reset if no hotspot is hovered
  hoverMarker.visible = false;
  renderer.domElement.style.cursor = 'default';
  updateUI();
}

// --- Point Cloud Filtering ---
function filterPointCloudNearOrigin(pointCloud, cylinderRadius = 0.25, cylinderHeight = 2.0) {
  const positions = pointCloud.geometry.attributes.position;
  const colors = pointCloud.geometry.attributes.color;
  
  const filteredPositions = [];
  const filteredColors = [];
  
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    
    // Calculate distance from center in XY plane (cylinder radius)
    const distanceXY = Math.sqrt(x * x + y * y);
    
    // Check if point is outside the exclusion cylinder
    if (distanceXY > cylinderRadius || Math.abs(z) > cylinderHeight / 2) {
      filteredPositions.push(x, y, z);
      
      if (colors) {
        filteredColors.push(
          colors.getX(i),
          colors.getY(i),
          colors.getZ(i)
        );
      }
    }
  }
  
  // Create new geometry with filtered points
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
  
  if (colors && filteredColors.length > 0) {
    newGeometry.setAttribute('color', new THREE.Float32BufferAttribute(filteredColors, 3));
  }
  
  // Replace existing geometry
  pointCloud.geometry.dispose();
  pointCloud.geometry = newGeometry;
  
  console.log(`Filtered point cloud: ${positions.count} -> ${filteredPositions.length / 3} points`);
}
