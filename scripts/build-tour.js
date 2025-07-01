import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

console.log('Starting tour generation script...');

const DATASET_PATH = path.resolve('public/datasets');
const OUTPUT_PATH = path.resolve('public/tour.json');

const CAM_CSV_PATH = path.join(DATASET_PATH, 'CAM.csv');
const POSE_FILE_PATH = path.join(DATASET_PATH, 'T1-College_of_Engineering-2-lidar_pose.txt');

// --- MATRICI DI CALIBRAZIONE E TRASFORMAZIONE ---

// Matrice di trasformazione da LiDAR a Camera 1 (estrinseci)
const LiDARtoCam1_T = new THREE.Vector3(0.000201694, 0.210414, -0.0715605);
const LiDARtoCam1_R = new THREE.Quaternion(0.623898, -0.345435, 0.326748, 0.620211).normalize();
const LiDARtoCam1 = new THREE.Matrix4().compose(LiDARtoCam1_T, LiDARtoCam1_R, new THREE.Vector3(1, 1, 1));

// Matrice per centrare il rig. Semplificazione a identità, dato che è una piccola traslazione.
const Cam1toBase = new THREE.Matrix4().identity();

// Rotazione manuale di correzione di 30 gradi sull'asse Y, come da script Python.
const manualAdjustment = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(30));

// Matrice per correggere il sistema di coordinate (Y in basso -> Y in alto)
const coordSystemFix = new THREE.Matrix4().makeRotationX(Math.PI);

// ***** NUOVA MATRICE DI CORREZIONE DELLA CONVENZIONE PANORAMA *****
// L'analisi del codice Python mostra che il centro del panorama è la direzione "destra" (+X) della camera.
// Dobbiamo ruotare di -90 gradi attorno all'asse Y per allineare la direzione "destra"
// della nuvola di punti con la direzione "avanti" (-Z) della scena Three.js.
const panoConventionFix = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(-90));
// *****************************************************************

// Costruiamo la matrice di trasformazione locale finale, `lidarToPanoMatrix`.
// L'ordine è FONDAMENTALE. Le trasformazioni vengono applicate ai punti da destra a sinistra.
// La catena logica è: P_pano = (Fixes) * (Adjustments) * (Calibration) * P_lidar
//
// M_final = panoConventionFix * coordSystemFix * manualAdjustment * Cam1toBase * LiDARtoCam1
//
// In Three.js (A.multiply(B) = A * B), costruiamo la catena:
const lidarToPanoMatrix = new THREE.Matrix4();
lidarToPanoMatrix.multiply(manualAdjustment);    // M = manualAdjustment
lidarToPanoMatrix.multiply(Cam1toBase);          // M = M * Cam1toBase
lidarToPanoMatrix.multiply(LiDARtoCam1);        // M = M * LiDARtoCam1

// Ora applichiamo le correzioni di sistema e convenzione "davanti" a tutto.
// Usiamo premultiply per A = FIX * A
lidarToPanoMatrix.premultiply(coordSystemFix);     // M = coordSystemFix * M
lidarToPanoMatrix.premultiply(panoConventionFix); // M = panoConventionFix * M

console.log('Calibration matrices loaded and composed with all fixes.');

// --- PARSING DEI FILE DI INPUT (Nessuna modifica qui) ---

function parsePoseFile(filePath) {
    // ... (codice invariato)
    console.log(`Parsing pose file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.trim().split('\n');
    const poseMap = new Map();

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 13) continue;

        const timestamp = parts[0];
        const matrixElements = parts.slice(1, 13).map(parseFloat);

        const matrix = new THREE.Matrix4();
        matrix.set(
            matrixElements[0], matrixElements[1], matrixElements[2], matrixElements[3],
            matrixElements[4], matrixElements[5], matrixElements[6], matrixElements[7],
            matrixElements[8], matrixElements[9], matrixElements[10], matrixElements[11],
            0, 0, 0, 1
        );

        poseMap.set(timestamp, matrix);
    }
    console.log(`Parsed ${poseMap.size} poses.`);
    return poseMap;
}

function parseCamCsv(filePath) {
    // ... (codice invariato)
    console.log(`Parsing CAM CSV file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    });
    console.log(`Parsed ${records.length} records from CAM.csv.`);
    return records;
}

function findClosestPose(timestamp, poseMap) {
    // ... (codice invariato)
    const targetTime = parseFloat(timestamp);
    let closestTime = null;
    let minDiff = Infinity;

    for (const key of poseMap.keys()) {
        const poseTime = parseFloat(key);
        const diff = Math.abs(targetTime - poseTime);
        if (diff < minDiff) {
            minDiff = diff;
            closestTime = key;
        }
    }
    return poseMap.get(closestTime);
}

// --- COSTRUZIONE DEL FILE tour.json (Nessuna modifica qui) ---
try {
    const poseMap = parsePoseFile(POSE_FILE_PATH);
    const camRecords = parseCamCsv(CAM_CSV_PATH);

    const tourData = {
        lidarToPanoMatrix: lidarToPanoMatrix.toArray(),
        stops: []
    };

    for (const record of camRecords) {
        const pcdTimestamp = record.pcd_name.replace('.pcd', '');
        const pcdTimeInSeconds = (BigInt(pcdTimestamp) / BigInt(1e9)) + '.' + (BigInt(pcdTimestamp) % BigInt(1e9));

        const worldMatrix = findClosestPose(pcdTimeInSeconds, poseMap);

        if (worldMatrix) {
            tourData.stops.push({
                image: `datasets/stitching/${record.image_name}`,
                pcd: `datasets/pcd/${record.pcd_name}`,
                worldMatrix: worldMatrix.toArray(),
            });
        } else {
            console.warn(`No pose found for pcd: ${record.pcd_name}`);
        }
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(tourData, null, 2));
    console.log(`✅ Success! Tour data has been written to ${OUTPUT_PATH}`);
    console.log(`Generated ${tourData.stops.length} tour stops.`);

} catch (error) {
    console.error('❌ An error occurred during tour generation:', error);
}