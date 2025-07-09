import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

let camera, scene, renderer;
let controls;
let tourData = []; // Initialize as an empty array
let currentStopIndex = 0;
let activeObjects = new THREE.Group();

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

function navigate(direction) {
  const newIndex = currentStopIndex + direction;
  loadStop(newIndex);
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
    onPointCloudClick(event);
  }
}

// --- Point Cloud Click Navigation (Front/Back) ---
function onPointCloudClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.2;
  raycaster.setFromCamera(mouse, camera);

  let pointCloud = null;
  activeObjects.traverse(obj => {
    if (obj.isPoints) pointCloud = obj;
  });
  if (!pointCloud) return;

  const intersects = raycaster.intersectObject(pointCloud);
  if (intersects.length === 0) return;

  const clickedPoint = intersects[0].point;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  // Vector from camera to clicked point (in world space)
  const camToPoint = new THREE.Vector3().subVectors(clickedPoint, camera.position).normalize();

  // Angle between camera forward and camToPoint
  const angle = camDir.angleTo(camToPoint);

  // Define front zone (within 45deg of camera forward), back zone (within 45deg of camera backward)
  const FRONT_ANGLE = Math.PI / 4; // 45 degrees

  let navigated = false;

  // Front: previous stop
  if (currentStopIndex > 0 && angle < FRONT_ANGLE) {
    loadStop(currentStopIndex - 1);
    navigated = true;
  }
  // Back: next stop
  if (!navigated && currentStopIndex < tourData.stops.length - 1 && angle > Math.PI - FRONT_ANGLE) {
    loadStop(currentStopIndex + 1);
    navigated = true;
  }

  if (!navigated) {
    infoDiv.textContent = "Click in front (previous) or back (next) to navigate.";
  }
}

// --- Hover Feedback Logic (Front/Back Zones) ---
function onMouseMoveHover(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.2;
  raycaster.setFromCamera(mouse, camera);

  let pointCloud = null;
  activeObjects.traverse(obj => {
    if (obj.isPoints) pointCloud = obj;
  });
  if (!pointCloud) {
    hoverMarker.visible = false;
    renderer.domElement.style.cursor = 'default';
    updateUI();
    return;
  }

  const intersects = raycaster.intersectObject(pointCloud);
  if (intersects.length === 0) {
    hoverMarker.visible = false;
    renderer.domElement.style.cursor = 'default';
    updateUI();
    return;
  }

  const intersectPoint = intersects[0].point;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const camToPoint = new THREE.Vector3().subVectors(intersectPoint, camera.position).normalize();
  const angle = camDir.angleTo(camToPoint);
  const FRONT_ANGLE = Math.PI / 4; // 45 degrees

  let hoveredZone = null;
  let hoverText = '';

  // Front: previous stop
  if (currentStopIndex > 0 && angle < FRONT_ANGLE) {
    hoveredZone = 'front';
    hoverText = 'Go to Previous Stop';
  }
  // Back: next stop
  if (!hoveredZone && currentStopIndex < tourData.stops.length - 1 && angle > Math.PI - FRONT_ANGLE) {
    hoveredZone = 'back';
    hoverText = 'Go to Next Stop';
  }

  if (hoveredZone) {
    hoverMarker.position.copy(intersectPoint);
    hoverMarker.visible = true;
    renderer.domElement.style.cursor = 'pointer';
    infoDiv.textContent = `${hoverText} (${currentStopIndex + 1} / ${tourData.stops.length})`;
  } else {
    hoverMarker.visible = false;
    renderer.domElement.style.cursor = 'default';
    updateUI();
  }
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
    
    // Calcola distanza dal centro nel piano XY (raggio cilindro)
    const distanceXY = Math.sqrt(x * x + y * y);
    
    // Controlla se il punto è fuori dal cilindro di esclusione
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
  
  // Crea nuova geometria con i punti filtrati
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));
  
  if (colors && filteredColors.length > 0) {
    newGeometry.setAttribute('color', new THREE.Float32BufferAttribute(filteredColors, 3));
  }
  
  // Sostituisci la geometria esistente
  pointCloud.geometry.dispose();
  pointCloud.geometry = newGeometry;
  
  console.log(`Filtered point cloud: ${positions.count} -> ${filteredPositions.length / 3} points`);
}
