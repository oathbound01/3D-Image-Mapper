import fs from 'fs';
import path from 'path';

console.log('Starting tour generation script...');

let pcdFiles = [];
let imgFiles = [];
const ALIGNMENTS_PATH = path.resolve('public/alignments.json');
const OUTPUT_PATH = path.resolve('public/tour.json');
const PCD_PATH = 'public/datasets/pcd/';
const IMG_PATH = 'public/datasets/stitching/';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function getSortedFiles(dir, exts) {
    const allFiles = fs.readdirSync(dir);
    const filtered = allFiles.filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)));
    return filtered.sort();
}

function readFileList(dir, exts) {
    const listPath = path.join(dir, 'list.json');
    if (!fs.existsSync(listPath)) {
        console.error(`list.json not found in ${dir}. Please ensure the file exists and contains a valid array of file names.`);
        return [];
    }
    const fileList = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
    if (!Array.isArray(fileList)) {
        console.error('Invalid list.json format. Expected an array of file names.');
        return [];
    }
    return fileList.filter(f => exts.some(ext => f.toLowerCase().endsWith(ext))).sort();
}

try {
    if (!fs.existsSync(ALIGNMENTS_PATH)) {
        throw new Error(`Alignments file not found at ${ALIGNMENTS_PATH}. Please run the alignment utility and save the file.`);
    }
    const alignments = JSON.parse(fs.readFileSync(ALIGNMENTS_PATH, 'utf-8'));
    console.log(`Loaded ${alignments.length} alignments.`);

    pcdFiles = readFileList(path.resolve(PCD_PATH), ['.pcd']);
    imgFiles = readFileList(path.resolve(IMG_PATH), IMAGE_EXTENSIONS);

    if (pcdFiles.length === 0 || imgFiles.length === 0) {
        throw new Error('No PCD or image files found in the dataset directories.');
    }

    const tourStops = [];
    
    for (let i = 0; i < alignments.length; i++) {
        const alignment = alignments[i];
        

        const tourStop = {
            image: alignment.image,
            pcd: alignment.pcd,
            matrix: alignment.matrix.map(n => parseFloat(n))
        };
        
        if (alignment.hotspots && alignment.hotspots.length > 0) {
            tourStop.hotspots = alignment.hotspots.map(hotspot => {
                return {
                    position: hotspot.position.map(n => parseFloat(n)),
                    targetScene: hotspot.targetScene
                };
            });
        }
        
        tourStops.push(tourStop);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(tourStops, null, 2));

    console.log(`Successfully generated tour.json with ${tourStops.length} stops.`);
    console.log(`Output written to ${OUTPUT_PATH}`);

} catch (error) {
    console.error('Failed to generate tour:', error.message);
    process.exit(1);
}
