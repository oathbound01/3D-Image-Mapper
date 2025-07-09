import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

console.log('Starting tour generation script...');

const DATASET_PATH = path.resolve('public/datasets');
const ALIGNMENTS_PATH = path.resolve('public/alignments.json'); // Expects alignments.json in the root
const OUTPUT_PATH = path.resolve('public/tour.json');
const PCD_PATH = '/datasets/pcd/';
const IMG_PATH = '/datasets/stitching/';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function getSortedFiles(dir, exts) {
    const allFiles = fs.readdirSync(dir);
    const filtered = allFiles.filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)));
    return filtered.sort();
}

try {
    // 1. Read the manually created alignments
    if (!fs.existsSync(ALIGNMENTS_PATH)) {
        throw new Error(`Alignments file not found at ${ALIGNMENTS_PATH}. Please run the alignment utility and save the file.`);
    }
    const alignments = JSON.parse(fs.readFileSync(ALIGNMENTS_PATH, 'utf-8'));
    console.log(`Loaded ${Object.keys(alignments).length} alignments.`);

    // 2. Get the lists of files to match indices
    const pcdFiles = getSortedFiles(path.join(DATASET_PATH, 'pcd'), ['.pcd']);
    const imgFiles = getSortedFiles(path.join(DATASET_PATH, 'stitching'), IMAGE_EXTENSIONS);

    if (pcdFiles.length === 0 || imgFiles.length === 0) {
        throw new Error('No PCD or image files found in the dataset directories.');
    }

    // 3. Build the tour data structure
    const tourStops = [];
    for (const index in alignments) {
        if (Object.hasOwnProperty.call(alignments, index)) {
            const idx = parseInt(index, 10);
            if (idx < imgFiles.length && idx < pcdFiles.length) {
                tourStops.push({
                    image: path.join(IMG_PATH, imgFiles[idx]).replace(/\\/g, '/'),
                    pcd: path.join(PCD_PATH, pcdFiles[idx]).replace(/\\/g, '/'),
                    matrix: alignments[index].map(n => parseFloat(n)) // Ensure numbers, not strings
                });
            } else {
                console.warn(`Skipping alignment for index ${idx} as it's out of bounds.`);
            }
        }
    }

    // 4. Write the output file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(tourStops, null, 2));

    console.log(`Successfully generated tour.json with ${tourStops.length} stops.`);
    console.log(`Output written to ${OUTPUT_PATH}`);

} catch (error) {
    console.error('Failed to generate tour:', error.message);
    process.exit(1); // Exit with an error code
}
