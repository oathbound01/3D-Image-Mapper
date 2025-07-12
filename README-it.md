<p align="center">
  <img src="docs/logo.png" width="256"></img>
</p>

---

<p align="center">
<img src="https://forthebadge.com/images/badges/built-with-love.svg">
<img src="https://forthebadge.com/images/badges/works-on-my-machine.svg">
<br>
<img src="https://img.shields.io/badge/three.js-000000?style=for-the-badge&logo=three.js&logoColor=white">
<img src="https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E">
</p>

<div align="center">
<h1>🗺️ 3D Image Mapper</h1>
Questo progetto è un framework per configurare e visualizzare tour panoramici 3D con dati point cloud.<br>
Sviluppato per l'esame di <b>Computer Graphics e Multimedia</b> (2024/2025) presso l'Università Politecnica delle Marche, tenuto dal Prof. Primo Zingaretti.<br>
Creato da <a href="https://github.com/nicolobartolinii">Nicolò Bartolini</a> e <a href="https://github.com/oathbound-01">Alessandro Rossini</a>.<br>
</div>

---

# 🇺🇸 [English version (Versione inglese)](README.md)

# 📋 Indice

- [🎯 Panoramica del progetto](#-panoramica-del-progetto)
- [🚀 Avvio rapido](#-avvio-rapido)
- [🛠️ Strumenti utilizzati](#-strumenti-utilizzati)
- [👥 Autori](#-autori)
- [📄 Licenza](#-licenza)

# 🎯 Panoramica del progetto

3D Image Mapper è un framework web per creare ed esplorare tour panoramici 3D utilizzando dati point cloud e immagini panoramiche. Il progetto è pensato come dimostrazione tecnica per il corso di Computer Graphics e Multimedia.

**Funzionalità principali:**
- Strumento di allineamento tra point cloud e immagini panoramiche
- Navigazione tra diverse tappe del tour
- Supporto VR di base con WebXR
- Funzionamento basato sui dataset forniti (vedi `public/datasets/`)

# 🚀 Avvio rapido

1. **Clona la repository:**
   ```bash
   git clone https://github.com/oathbound01/3D-Image-Mapper
   cd 3D-Image-Mapper
   ```
2. **Installa le dipendenze:**
   ```bash
   npm install
   ```
3. **Crea il tour virtuale:**
   - Posiziona le tue immagini panoramiche nella directory `public/datasets/stitching/` e i file point cloud nella directory `public/datasets/pcd/`.
   - Posiziona due file `list.json` in entrambe le directory precedenti. Questi file devono contenere solo un array con i nomi dei file delle immagini e dei PCD che verranno utilizzati per il tour. Lo strumento abbinerà quindi i file immagine e PCD con gli stessi indici negli array. Esempio:
   ```js
   ["0000.png", "0054.png", "0108.png", "0162.png", "0216.png", "0269.png"]
   ```
   In questo caso, `0000.png` verrà abbinato con il primo PCD nel rispettivo array `list.json`, `0054.png` verrà abbinato con il secondo file PCD, ecc...
4. **Avvia il server di sviluppo:**
   Quando tutti i dati rilevanti sono stati posizionati correttamente, esegui questo comando per avviare l'applicazione:
   ```bash
   npm run dev
   ```
5. **Apri il browser:**
   - Visita [http://localhost:5174](http://localhost:5174) (o l'indirizzo mostrato nel terminale).
   - Usa lo *Strumento di allineamento* per sincronizzare la coppia panorama/pcd
   - Aggiungi eventuali hotspot rilevanti alla scena per la navigazione tra le tappe
   - Esporta il tuo `alignments.json` una volta terminato tutto e posizionalo nella cartella `public/`

   <img src="docs/alignment tool UI.png" width=768></img>

6. **Prova il tour virtuale:**

   Una volta terminato tutto, naviga semplicemente alla pagina principale dell'applicazione sul tuo browser e seleziona l'opzione *Visualizza tour* per provarlo.

   <img src="docs/tour example.gif" width=768>

   Puoi entrare in modalità VR cliccando il pulsante *ENTER VR MODE*.

   NOTA: La navigazione VR tra le scene è supportata solo con visori che usano controller.

# 📊 Dataset di test

Per costruire, testare e debuggare questo framework abbiamo utilizzato immagini panoramiche e dati PCD dal [dataset PAIR360](https://airlabkhu.github.io/PAIR-360-Dataset/) del Kyung Hee University AIRLAB. Questo dataset è disponibile sotto la [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Parti di questo dataset sono incluse nei file di questo progetto per fornire esempi delle funzionalità di questo framework. Il paper che descrive il contenuto del loro dataset si trova [a questo link](https://ieeexplore.ieee.org/document/10679919)

# 🛠️ Strumenti utilizzati

- [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [Three.js](https://threejs.org/) (rendering 3D WebGL)
- [Vite](https://vitejs.dev/) (server di sviluppo e strumento di build)
- [WebXR](https://immersiveweb.dev) (integrazione XR)

# 👥 Autori

- [Nicolò Bartolini](https://github.com/nicolobartolinii) (Matricola 1118768)
- [Alessandro Rossini](https://github.com/oathbound01) (Matricola 1119002)

# 📄 Licenza

[GNU GPL License](LICENSE)

Copyright © 2025 Nicolò Bartolini, Alessandro Rossini
