import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";

// --- Scene globals ---
let camera, scene, renderer, controls;
let controller1, controller2;
let tourData = [];
let currentStopIndex = 0;
const activeObjects = new THREE.Group();
const hotspotObjects = new THREE.Group();

// --- UI Elements ---
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const infoDiv = document.getElementById("info");

// --- Hover marker setup ---
let hoverMarker;
function createHoverMarker() {
  const geometry = new THREE.SphereGeometry(0.25, 20, 20);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.6,
    transparent: true,
  });
  hoverMarker = new THREE.Mesh(geometry, material);
  hoverMarker.visible = false;
  scene.add(hoverMarker);
}

// --- Click/drag detection ---
let mouseDownPos = null;
let mouseMoved = false;

// --- Raycaster for interactions ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function showToast(message, type = 'success', duration = 3000) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

init();

async function init() {
  try {
    const response = await fetch("alignments.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    tourData = await response.json();
  } catch (error) {
    showToast('Error: Could not load tour data', 'error', 5000);
    console.error("Failed to fetch tour data:", error);
    return;
  }

  scene = new THREE.Scene();

  scene.background = new THREE.Color(0x101010);
  scene.add(activeObjects);
  scene.add(hotspotObjects);

  // Axes Helper (optional, for debugging)
  // scene.add(new THREE.AxesHelper(20));

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true;
  controls.enableDamping = true;

  document.body.appendChild(renderer.domElement);

  // --- VR Controllers ---
  function onSelectStart(event) {
    const controller = event.target;
    const intersections = getIntersections(controller);

    if (intersections.length > 0) {
      let hotspot = intersections[0].object;
      while (hotspot.parent && !hotspot.userData.type) {
        hotspot = hotspot.parent;
      }

      if (hotspot.userData && hotspot.userData.type === "hotspot") {
        const targetSceneIndex = hotspot.userData.targetSceneIndex;
        navigateToScene(targetSceneIndex);
      }
    }
  }

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener("selectstart", onSelectStart);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener("selectstart", onSelectStart);
  scene.add(controller2);

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  const line = new THREE.Line(geometry);
  line.name = "line";
  line.scale.z = 5;

  controller1.add(line.clone());
  controller2.add(line.clone());
  
  const vrWrapper = document.createElement('div');
  vrWrapper.style.position = 'fixed';
  vrWrapper.style.bottom = '80px';
  vrWrapper.style.left = '20px';
  vrWrapper.style.zIndex = '15';
  vrWrapper.style.pointerEvents = 'auto';
  
  const vrButton = VRButton.createButton(renderer);
  
  vrButton.style.setProperty('position', 'relative', 'important');
  vrButton.style.setProperty('top', 'auto', 'important');
  vrButton.style.setProperty('bottom', 'auto', 'important');
  vrButton.style.setProperty('left', 'auto', 'important');
  vrButton.style.setProperty('right', 'auto', 'important');
  vrButton.style.setProperty('transform', 'none', 'important');
  vrButton.style.setProperty('margin', '0', 'important');
  
  vrButton.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
  vrButton.style.border = 'none';
  vrButton.style.borderRadius = '10px';
  vrButton.style.padding = '12px 18px';
  vrButton.style.color = 'white';
  vrButton.style.fontWeight = '600';
  vrButton.style.fontSize = '14px';
  vrButton.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  vrButton.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
  vrButton.style.transition = 'all 0.3s ease';
  vrButton.style.cursor = 'pointer';
  vrButton.style.width = 'auto';
  vrButton.style.height = 'auto';
  vrButton.style.minWidth = 'auto';
  vrButton.style.minHeight = 'auto';
  vrButton.style.maxWidth = 'none';
  vrButton.style.maxHeight = 'none';
  
  vrButton.addEventListener('mouseenter', () => {
    vrButton.style.transform = 'translateY(-2px)';
    vrButton.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
  });
  vrButton.addEventListener('mouseleave', () => {
    vrButton.style.transform = 'translateY(0)';
    vrButton.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
  });
  
  vrWrapper.appendChild(vrButton);
  document.body.appendChild(vrWrapper);

  window.addEventListener("resize", onWindowResize);
  prevBtn.addEventListener("click", () => navigate(-1));
  nextBtn.addEventListener("click", () => navigate(1));
  renderer.domElement.addEventListener("mousedown", onMouseDown);
  renderer.domElement.addEventListener("mousemove", onMouseMoveHover);
  renderer.domElement.addEventListener("mouseup", onMouseUp);

  createHoverMarker();

  if (tourData.length > 0) {
    await loadStop(0);
  } else {
    showToast('No stops found in tour data', 'warning', 5000);
  }

  renderer.setAnimationLoop(animate);
}

async function loadStop(index) {
  if (index < 0 || index >= tourData.length) {
    return;
  }

  currentStopIndex = index;

  activeObjects.clear();
  hotspotObjects.clear();

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
    pcd.material.size = stopData.matrix[9] * 0.03;
    const pcdMatrix = new THREE.Matrix4().fromArray(stopData.matrix);
    pcd.geometry.applyMatrix4(pcdMatrix);

    filterPointCloudNearOrigin(pcd, 0.3, 4);

    activeObjects.add(pcd);

    // Create hotspots if they exist in this stop
    if (stopData.hotspots && stopData.hotspots.length > 0) {
      createHotspots(stopData.hotspots, pcdMatrix);
    }

    camera.position.set(0,0,0);
    controls.target.set(0,0,0.0001);
    controls.update();

    updateUI();
  } catch (error) {
    showToast(`Error loading stop ${index + 1}`, 'error', 4000);
    console.error(`Failed to load stop ${index + 1}:`, error);
  }
}

function createHotspots(hotspots, pcdMatrix) {
  hotspots.forEach((hotspot, idx) => {
    const hotspotGroup = new THREE.Group();
    
    const mainGeometry = new THREE.SphereGeometry(0.15, 20, 20);
    const mainMaterial = new THREE.MeshBasicMaterial({
      color: 0x4ecdc4,
      opacity: 0.8,
      transparent: true,
    });
    const mainSphere = new THREE.Mesh(mainGeometry, mainMaterial);
    
    const ringGeometry = new THREE.RingGeometry(0.18, 0.22, 20);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x44a08d,
      opacity: 0.4,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.lookAt(camera.position);
    
    const coreGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.9,
      transparent: true,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    
    hotspotGroup.add(mainSphere);
    hotspotGroup.add(ring);
    hotspotGroup.add(core);
    
    const position = new THREE.Vector3(
      hotspot.position[0],
      hotspot.position[1],
      hotspot.position[2]
    );

    position.applyMatrix4(pcdMatrix);
    hotspotGroup.position.copy(position);

    hotspotGroup.userData = {
      type: "hotspot",
      targetSceneIndex: hotspot.targetScene,
    };

    hotspotGroup.name = `hotspot-${idx}`;
    
    hotspotGroup.userData.mainSphere = mainSphere;
    hotspotGroup.userData.ring = ring;
    hotspotGroup.userData.core = core;

    hotspotObjects.add(hotspotGroup);
  });
}

function navigate(direction) {
  const newIndex = currentStopIndex + direction;
  loadStop(newIndex);
}

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

const tempMatrix = new THREE.Matrix4();

function getIntersections(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(hotspotObjects.children, true);
}

function animate() {
  controls.update();

  if (renderer.xr.isPresenting) {
    const intersections1 = getIntersections(controller1);
    const line1 = controller1.getObjectByName("line");
    if (line1) {
      if (intersections1.length > 0) {
        line1.material.color.setHex(0x00ff00); // green
      } else {
        line1.material.color.setHex(0xffffff); // white
      }
    }

    const intersections2 = getIntersections(controller2);
    const line2 = controller2.getObjectByName("line");
    if (line2) {
      if (intersections2.length > 0) {
        line2.material.color.setHex(0x00ff00); // green
      } else {
        line2.material.color.setHex(0xffffff); // white
      }
    }
  }

  const time = Date.now() * 0.001;
  hotspotObjects.children.forEach((hotspot, index) => {
    const breatheScale = 1 + 0.15 * Math.sin(time * 2 + index * 0.8);
    const mainSphere = hotspot.userData.mainSphere;
    const ring = hotspot.userData.ring;
    const core = hotspot.userData.core;
    
    if (mainSphere) {
      mainSphere.scale.set(breatheScale, breatheScale, breatheScale);
    }
    
    if (ring) {
      ring.rotation.z += 0.01;
      ring.lookAt(camera.position);
    }
    
    if (core) {
      const pulseScale = 1 + 0.3 * Math.sin(time * 4 + index * 1.2);
      core.scale.set(pulseScale, pulseScale, pulseScale);
    }
    
    const originalY = hotspot.userData.originalY || hotspot.position.y;
    if (!hotspot.userData.originalY) {
      hotspot.userData.originalY = originalY;
    }
    hotspot.position.y = originalY + 0.05 * Math.sin(time * 1.5 + index * 0.5);
  });

  renderer.render(scene, camera);
}

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

  if (moveDist < 5) {
    onSceneClick(event);
  }
}

function onSceneClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const hotspotIntersects = raycaster.intersectObjects(hotspotObjects.children, true);
  if (hotspotIntersects.length > 0) {
    // Find the parent hotspot group
    let hotspot = hotspotIntersects[0].object;
    while (hotspot.parent && !hotspot.userData.type) {
      hotspot = hotspot.parent;
    }
    
    if (hotspot.userData && hotspot.userData.type === "hotspot") {
      const targetSceneIndex = hotspot.userData.targetSceneIndex;
      if (navigateToScene(targetSceneIndex)) {
        return;
      }
    }
  }

  // handlePointCloudClick(raycaster);
}

/*
function handlePointCloudClick(raycaster) {
  raycaster.params.Points.threshold = 0.2;

  let pointCloud = null;
  activeObjects.traverse((obj) => {
    if (obj.isPoints) pointCloud = obj;
  });
  if (!pointCloud) return;

  const intersects = raycaster.intersectObject(pointCloud);
  if (intersects.length === 0) return;
}
*/

function onMouseMoveHover(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const hotspotIntersects = raycaster.intersectObjects(hotspotObjects.children, true);
  if (hotspotIntersects.length > 0) {
    let hotspot = hotspotIntersects[0].object;
    while (hotspot.parent && !hotspot.userData.type) {
      hotspot = hotspot.parent;
    }
    
    if (hotspot.userData && hotspot.userData.type === "hotspot") {
      const targetSceneIndex = hotspot.userData.targetSceneIndex;

      hoverMarker.position.copy(hotspot.position);
      hoverMarker.visible = true;
      renderer.domElement.style.cursor = "pointer";
      infoDiv.textContent = `Go to Scene ${targetSceneIndex + 1}`;
      return;
    }
  }

  hoverMarker.visible = false;
  renderer.domElement.style.cursor = "default";
  updateUI();
}

function filterPointCloudNearOrigin(
  pointCloud,
  cylinderRadius = 0.25,
  cylinderHeight = 2.0
) {
  const positions = pointCloud.geometry.attributes.position;
  const colors = pointCloud.geometry.attributes.color;

  const filteredPositions = [];
  const filteredColors = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    const distanceXY = Math.sqrt(x * x + y * y);

    if (distanceXY > cylinderRadius || Math.abs(z) > cylinderHeight / 2) {
      filteredPositions.push(x, y, z);

      if (colors) {
        filteredColors.push(colors.getX(i), colors.getY(i), colors.getZ(i));
      }
    }
  }

  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(filteredPositions, 3)
  );

  if (colors && filteredColors.length > 0) {
    newGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(filteredColors, 3)
    );
  }

  pointCloud.geometry.dispose();
  pointCloud.geometry = newGeometry;

  console.log(
    `Filtered point cloud: ${positions.count} -> ${
      filteredPositions.length / 3
    } points`
  );
}
