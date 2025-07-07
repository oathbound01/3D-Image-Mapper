import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {PCDLoader} from 'three/examples/jsm/loaders/PCDLoader.js';
import {VRButton} from 'three/examples/jsm/webxr/VRButton.js';

let camera, scene, renderer;
let controls;
let tourData = null;
let currentStopIndex = 0;
let activeObjects = new THREE.Group();

const lidarToPanoMatrix = new THREE.Matrix4();
const worldMatrix = new THREE.Matrix4();

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const infoDiv = document.getElementById('info');

init();

async function init() {
    try {
        const response = await fetch('tour.json');
        tourData = await response.json();
        console.log("Tour data loaded:", tourData);
        lidarToPanoMatrix.fromArray(tourData.lidarToPanoMatrix);
    } catch (error) {
        console.error("Failed to load tour.json:", error);
        infoDiv.textContent = "Error: Could not load tour data.";
        return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);
    scene.add(activeObjects);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.target.set(0, 0, -1);

    window.addEventListener('resize', onWindowResize);
    prevBtn.addEventListener('click', () => navigate(-1));
    nextBtn.addEventListener('click', () => navigate(1));

    if (tourData.stops.length > 0) {
        await loadStop(0);
    } else {
        infoDiv.textContent = "No stops in tour data.";
    }

    renderer.setAnimationLoop(animate);
}

async function loadStop(index) {
    if (index < 0 || index >= tourData.stops.length) {
        console.warn(`Index ${index} is out of bounds.`);
        return;
    }
    currentStopIndex = index;

    activeObjects.clear();

    const stopData = tourData.stops[index];
    const textureLoader = new THREE.TextureLoader();
    const pcdLoader = new PCDLoader();

    infoDiv.textContent = `Loading stop ${index + 1} / ${tourData.stops.length}...`;

    try {
        const [panoTexture, pcd] = await Promise.all([
            textureLoader.loadAsync(stopData.image),
            pcdLoader.loadAsync(stopData.pcd),
        ]);

        const sphereGeo = new THREE.SphereGeometry(500, 60, 40);
        sphereGeo.scale(-1, 1, 1);
        const sphereMat = new THREE.MeshBasicMaterial({map: panoTexture});
        const panoSphere = new THREE.Mesh(sphereGeo, sphereMat);
        activeObjects.add(panoSphere);

        pcd.material.size = 0.03;
        pcd.geometry.applyMatrix4(lidarToPanoMatrix);

        activeObjects.add(pcd);

        worldMatrix.fromArray(stopData.worldMatrix);
        activeObjects.position.setFromMatrixPosition(worldMatrix);
        activeObjects.quaternion.setFromRotationMatrix(worldMatrix);

        camera.position.copy(activeObjects.position);
        camera.position.y += 0.1;
        controls.target.copy(activeObjects.position);

        updateUI();
        console.log(`Stop ${index} loaded successfully.`);

    } catch (error) {
        console.error(`Failed to load stop ${index}:`, error);
        infoDiv.textContent = `Error loading stop ${index + 1}.`;
    }
}

function navigate(direction) {
    const newIndex = currentStopIndex + direction;
    loadStop(newIndex);
}

function updateUI() {
    infoDiv.textContent = `Stop ${currentStopIndex + 1} / ${tourData.stops.length}`;
    prevBtn.disabled = currentStopIndex === 0;
    nextBtn.disabled = currentStopIndex === tourData.stops.length - 1;
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