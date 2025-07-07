<p align="center">
  <img src="logo.png" width="256"></img>
</p>

---

<p align="center">
<img src="https://forthebadge.com/images/badges/built-with-love.svg">
<img src="https://forthebadge.com/images/badges/works-on-my-machine.svg">
<br>
<img src="https://img.shields.io/badge/three.js-000000?style=for-the-badge&logo=three.js&logoColor=white">
<img src="https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E">
<img src="https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54">
</p>

<div align="center">
<h1>🗺️ 3D Image Mapper</h1>
This project is a work-in-progress web application for visualizing 3D panoramic tours with point cloud data.<br>
Developed for the <b>Computer Graphics e Multimedia</b> exam (2024/2025) at Università Politecnica delle Marche, led by Prof. Primo Zingaretti.<br>
Built by <a href="https://github.com/nicolobartolinii">Nicolò Bartolini</a> and <a href="https://github.com/oathbound-01">Alessandro Rossini</a>.<br>
</div>

---

# 🇮🇹 [Versione italiana (Italian version)](README-it.md)

# 📋 Table of contents

- [🎯 Project overview](#-project-overview)
- [🚀 Quick start](#-quick-start)
- [🛠️ Tools used](#-tools-used)
- [👥 Authors](#-authors)
- [📄 License](#-license)

# 🎯 Project overview

3D-Image-Mapper is a web-based tool for exploring 3D panoramic tours using point cloud and panoramic image data. The project is still under active development and is intended as a technical demonstration for the Computer Graphics e Multimedia course.

**Main features (WIP):**
- Visualization of panoramic images mapped to 3D point clouds
- Navigation between different tour stops
- Basic VR support (Three.js WebXR)
- Data-driven from provided datasets (see `public/datasets/`)

# 🚀 Quick start

> **Note:** This project is a work in progress. Instructions may change as development continues.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/oathbound01/3D-Image-Mapper
   cd 3D-Image-Mapper
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Create the virtual tour steps**:
   - Place your panoramic images in the `public/datasets/stitching/` directory and point cloud files in the `public/datasets/pcd/` directory.
   - Place the pose file (TXT format) and the CAM alignment data (CSV format) in the `public/datasets/` directory.
   - Place the intrinsic parameters data in the `public/datasets/params/Cam_to_Cam/` (NPY format).
   - Use the provided scripts to convert or build tour data:
   ```bash
   npm run build:tour
   ```
4. **Run the development server:**
   ```bash
   npm run dev
   ```
5. **Open your browser:**
   Visit [http://localhost:5173](http://localhost:5173) (or the port shown in your terminal).


# 🛠️ Tools used

- [Three.js](https://threejs.org/) (WebGL 3D rendering)
- [Vite](https://vitejs.dev/) (development server and build tool)
- [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [Python](https://www.python.org/) (for data preprocessing scripts)

# 👥 Authors

- [Nicolò Bartolini](https://github.com/nicolobartolinii) (Matricola 1118768)
- [Alessandro Rossini](https://github.com/oathbound01) (Matricola 1119002)

# 📄 License

[GNU GPL License](LICENSE)

Copyright © 2025 Nicolò Bartolini, Alessandro Rossini