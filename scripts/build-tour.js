import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

console.log('Starting tour generation script...');

const DATASET_PATH = path.resolve('public/datasets');
const OUTPUT_PATH = path.resolve('public/tour.json');

const CALIBRATION_PATH = path.join(DATASET_PATH, 'Params/Cam_to_Cam/1104');
const CAM_CSV_PATH = path.join(DATASET_PATH, 'CAM.csv');
const POSE_FILE_PATH = path.join(DATASET_PATH, 'T1-College_of_Engineering-2-lidar_pose.txt');

const LiDARtoCam1_T = new THREE.Vector3(0.000201694, 0.210414, -0.0715605);
const LiDARtoCam1_R = new THREE.Quaternion(0.623898, -0.345435, 0.326748, 0.620211).normalize();
const LiDARtoCam1 = new THREE.Matrix4().compose(LiDARtoCam1_T, LiDARtoCam1_R, new THREE.Vector3(1, 1, 1));

console.log(`Loading Cam-to-Cam calibrations from: ${CALIBRATION_PATH}`);
const basePosition = new THREE.Vector3(0, 0, 0);
for (let i = 2; i <= 6; i++) {
    const jsonPath = path.join(CALIBRATION_PATH, `T_${i}1.json`);
    const matrixData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const translation = new THREE.Vector3(matrixData[0][3], matrixData[1][3], matrixData[2][3]);
    basePosition.add(translation);
}
basePosition.divideScalar(6);
const Cam1toBase = new THREE.Matrix4().makeTranslation(basePosition.negate());
console.log('Cam1toBase matrix calculated successfully.');

const manualAdjustment = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(30));
const coordSystemFix = new THREE.Matrix4().makeRotationX(Math.PI);
const panoConventionFix = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(180));

const lidarToPanoMatrix = new THREE.Matrix4();
lidarToPanoMatrix.multiply(manualAdjustment);
lidarToPanoMatrix.multiply(Cam1toBase);
lidarToPanoMatrix.multiply(LiDARtoCam1);
lidarToPanoMatrix.premultiply(coordSystemFix);
lidarToPanoMatrix.premultiply(panoConventionFix);

console.log('Final transformation matrix composed.');

function parsePoseFile(filePath) {
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

try {
    const poseMap = parsePoseFile(POSE_FILE_PATH);
    const camRecords = parseCamCsv(CAM_CSV_PATH);

    // TEST CODE FOR EQUIDISTANT STOPS

    const totalStops = camRecords.length;
    const numStops = 20;

    // Calculate equidistant indices
    const step = Math.floor(totalStops / (numStops - 1));
    const selectedIndices = [];
    for (let i = 0; i < numStops - 1; i++) {
    selectedIndices.push(i * step);
    }
    // Ensure last index is included
    selectedIndices.push(totalStops - 1);


    const tourData = {
        lidarToPanoMatrix: lidarToPanoMatrix.toArray(),
        stops: []
    };

    for (let i = 0; i < selectedIndices.length; i++) {
        const idx = selectedIndices[i];
        const record = camRecords[idx];
        const pcdTimestamp = record.pcd_name.replace('.pcd', '');
        const pcdTimeInSeconds = (BigInt(pcdTimestamp) / BigInt(1e9)) + '.' + (BigInt(pcdTimestamp) % BigInt(1e9));
        const worldMatrix = findClosestPose(pcdTimeInSeconds, poseMap);
        if (worldMatrix) {
            tourData.stops.push({
            image: `datasets/stitching/${record.image_name}`,
            pcd: `datasets/pcd/${record.pcd_name}`,
            worldMatrix: worldMatrix.toArray(),
            });
        }
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(tourData, null, 2));
    console.log(`Success! Tour data has been written to ${OUTPUT_PATH}`);
} catch (error) {
    console.error('An error occurred during tour generation:', error);
}