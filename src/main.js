import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

let camera, scene, renderer;
let controls;
let tourData = null;
let currentStopIndex = 0;
let activeObjects = new THREE.Group(); // Gruppo per gli oggetti attivi (sfera + pcd)

// --- Matrici riutilizzabili per performance ---
const lidarToPanoMatrix = new THREE.Matrix4();
const worldMatrix = new THREE.Matrix4();

// --- Elementi UI ---
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const infoDiv = document.getElementById('info');

// --- Inizializzazione ---
init();

async function init() {
    // 1. Carica i dati del tour
    try {
        const response = await fetch('tour.json');
        tourData = await response.json();
        console.log("Tour data loaded:", tourData);
        // Pre-carica la matrice di allineamento locale
        lidarToPanoMatrix.fromArray(tourData.lidarToPanoMatrix);
    } catch (error) {
        console.error("Failed to load tour.json:", error);
        infoDiv.textContent = "Error: Could not load tour data.";
        return;
    }

    // 2. Setup della scena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);
    scene.add(activeObjects);

    // 3. Setup della camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Posizioniamo la camera al centro del primo stop per iniziare
    camera.position.set(0, 1.6, 0); // Altezza media di una persona

    // 4. Setup del renderer e WebXR
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    // 5. Controlli
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.target.set(0, 1.6, -1); // Guarda avanti

    // 6. Listener per eventi
    window.addEventListener('resize', onWindowResize);
    prevBtn.addEventListener('click', () => navigate(-1));
    nextBtn.addEventListener('click', () => navigate(1));

    // 7. Carica il primo stop
    if (tourData.stops.length > 0) {
        await loadStop(0);
    } else {
        infoDiv.textContent = "No stops in tour data.";
    }

    // 8. Avvia il ciclo di rendering
    renderer.setAnimationLoop(animate);
}

// --- Funzione per caricare uno "stop" del tour ---
async function loadStop(index) {
    if (index < 0 || index >= tourData.stops.length) {
        console.warn(`Index ${index} is out of bounds.`);
        return;
    }
    currentStopIndex = index;

    // Pulisci gli oggetti della scena precedente
    activeObjects.clear();

    const stopData = tourData.stops[index];
    const textureLoader = new THREE.TextureLoader();
    const pcdLoader = new PCDLoader();

    // Mostra un feedback di caricamento
    infoDiv.textContent = `Loading stop ${index + 1} / ${tourData.stops.length}...`;

    try {
        // Carica in parallelo immagine e point cloud
        const [panoTexture, pcd] = await Promise.all([
            textureLoader.loadAsync(stopData.image),
            pcdLoader.loadAsync(stopData.pcd),
        ]);

        // 1. Crea la sfera panoramica
        const sphereGeo = new THREE.SphereGeometry(500, 60, 40);
        // Inverti la geometria per vedere la texture dall'interno
        sphereGeo.scale(-1, 1, 1);
        const sphereMat = new THREE.MeshBasicMaterial({ map: panoTexture });
        const panoSphere = new THREE.Mesh(sphereGeo, sphereMat);
        // La sfera è il nostro "mondo locale", quindi non ha bisogno di trasformazioni.
        // La sua posizione è implicitamente (0,0,0) rispetto al gruppo `activeObjects`.
        activeObjects.add(panoSphere);

        // 2. Configura e allinea la nuvola di punti
        // La matrice `lidarToPanoMatrix` è la stessa per tutti e allinea
        // i punti della nuvola (in coordinate LiDAR) alla sfera panoramica.
        pcd.material.size = 0.05; // Rendi i punti più visibili
        pcd.geometry.applyMatrix4(lidarToPanoMatrix); // Applica la trasformazione una sola volta

        // Il PCD è ora allineato alla sfera.
        activeObjects.add(pcd);

        // 3. Posiziona il gruppo di oggetti nel mondo
        // La `worldMatrix` posiziona l'intero stop (sfera + pcd allineato)
        // nella sua posizione globale nella scena.
        worldMatrix.fromArray(stopData.worldMatrix);
        activeObjects.position.setFromMatrixPosition(worldMatrix);
        activeObjects.quaternion.setFromRotationMatrix(worldMatrix);

        // 4. Sposta la camera al centro del nuovo stop
        camera.position.copy(activeObjects.position);
        camera.position.y += 1.6; // Simula l'altezza degli occhi
        controls.target.copy(activeObjects.position);

        updateUI();
        console.log(`Stop ${index} loaded successfully.`);

    } catch (error) {
        console.error(`Failed to load stop ${index}:`, error);
        infoDiv.textContent = `Error loading stop ${index + 1}.`;
    }
}

// --- Funzioni di Utilità ---

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