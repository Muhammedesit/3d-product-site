// Frontend-only MVP generator.
// Goal: produce a clean "dual-text illusion" style solid from two words, previewable as GLB and downloadable as STL.
// This is implemented from scratch using Three.js primitives (no proprietary generators).

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.158.0/examples/jsm/geometries/TextGeometry.js';
import { BufferGeometryUtils } from 'https://unpkg.com/three@0.158.0/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'https://unpkg.com/three@0.158.0/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'https://unpkg.com/three@0.158.0/examples/jsm/exporters/STLExporter.js';

const $ = (id) => document.getElementById(id);

function getQueryParams() {
  const params = new URLSearchParams(location.search);
  return {
    wordA: params.get('wordA') || '',
    wordB: params.get('wordB') || ''
  };
}

function normalizeWord(s) {
  return (s || '').trim().toUpperCase();
}

function validateInputs(wordA, wordB) {
  if (!wordA || !wordB) return 'Please enter both words.';
  if (wordA.length !== wordB.length) return 'Words must have the same length for this MVP.';
  if (wordA.length < 2) return 'Words are too short.';
  return null;
}

// -- Geometry abstraction (backend-ready) --
// In Phase 2, you can move this function behind a /generate API.
async function buildDualTextGeometry({ wordA, wordB, fontUrl, size, height, padding, filletPct }) {
  const loader = new FontLoader();
  const font = await new Promise((resolve, reject) => {
    loader.load(fontUrl, resolve, undefined, reject);
  });

  const tOpts = {
    font,
    size,
    depth: height,
    curveSegments: 8,
    bevelEnabled: filletPct > 0,
    bevelThickness: height * 0.12 * filletPct,
    bevelSize: size * 0.02 * filletPct,
    bevelSegments: filletPct > 0 ? 2 : 0
  };

  const geoA = new TextGeometry(wordA, tOpts);
  const geoB = new TextGeometry(wordB, tOpts);

  // Center each geometry around origin (TextGeometry extrudes in +Z by default)
  const centerGeometry = (g) => {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const cx = (bb.max.x + bb.min.x) / 2;
    const cy = (bb.max.y + bb.min.y) / 2;
    g.translate(-cx, -cy, -height / 2);
  };

  centerGeometry(geoA);
  centerGeometry(geoB);

  // Create illusion by rotating wordB 90 degrees around Y.
  // When viewed from front: A reads. From side: B reads.
  geoB.rotateY(Math.PI / 2);

  // Padding offsets the rotated text so the merge is less degenerate.
  geoB.translate(padding, 0, 0);

  // Merge (boolean-like approximation): merge buffer geometries.
  // For MVP: slicers typically union overlapping volumes.
  const merged = BufferGeometryUtils.mergeGeometries([geoA, geoB], true);
  merged.computeBoundingBox();
  merged.computeVertexNormals();

  return merged;
}

function setError(msg) {
  const box = $('genError');
  if (!box) return;
  if (!msg) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  box.classList.remove('hidden');
  box.textContent = msg;
}

// --- Preview (Three.js canvas) ---
function makePreviewScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(120, 90, 140);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 1.0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(200, 300, 200);
  scene.add(dir);

  const grid = new THREE.GridHelper(300, 20, 0x334155, 0x1f2937);
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  let mesh = null;

  const material = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.05 });

  function setGeometry(geometry) {
    if (mesh) {
      mesh.geometry.dispose();
      scene.remove(mesh);
    }

    mesh = new THREE.Mesh(geometry, material);

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);

    // Place on grid
    mesh.position.y = size.y / 2;

    scene.add(mesh);

    // Reframe camera
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(maxDim * 1.2, maxDim * 1.0, maxDim * 1.4);
    controls.target.set(0, size.y / 2, 0);
    controls.update();
  }

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  window.addEventListener('resize', resize);
  resize();
  render();

  return { scene, camera, renderer, setGeometry };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportGLB(mesh) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      mesh,
      (gltf) => {
        const blob = new Blob([gltf instanceof ArrayBuffer ? gltf : JSON.stringify(gltf)], {
          type: gltf instanceof ArrayBuffer ? 'model/gltf-binary' : 'application/json'
        });
        resolve(blob);
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

function exportSTL(mesh) {
  const exporter = new STLExporter();
  const stlString = exporter.parse(mesh, { binary: false });
  return new Blob([stlString], { type: 'model/stl' });
}

async function main() {
  // Prefill from query params
  const qp = getQueryParams();
  if (qp.wordA) $('wordA').value = qp.wordA;
  if (qp.wordB) $('wordB').value = qp.wordB;

  const canvas = $('threePreview');
  const preview = makePreviewScene(canvas);

  let latestMesh = null;
  let latestGlbBlobUrl = null;

  // GitHub Pages friendly: local repo font path (relative URL).
  // NOTE: you must add this file at: ./fonts/helvetiker_regular.typeface.json
  const fontUrl = 'fonts/helvetiker_regular.typeface.json';

  function updateFontWeightOptions() {
    const variant = $('fontVariant');
    if (!variant) return;
    variant.innerHTML = '';
    variant.appendChild(new Option('Regular', 'regular'));
  }

  // Keep existing UI, but only one repo-provided font is used in the MVP.
  const fontSelect = $('font');
  if (fontSelect) {
    fontSelect.innerHTML = '';
    fontSelect.appendChild(new Option('Helvetiker', 'helvetiker'));
    fontSelect.value = 'helvetiker';
    fontSelect.addEventListener('change', updateFontWeightOptions);
  }
  updateFontWeightOptions();

  $('generateBtn').addEventListener('click', async () => {
    setError(null);

    const wordA = normalizeWord($('wordA').value);
    const wordB = normalizeWord($('wordB').value);

    const err = validateInputs(wordA, wordB);
    if (err) return setError(err);

    const size = Number($('fontSize').value);
    const height = Number($('extrudeHeight').value);
    const padding = Number($('padding').value);
    const filletPct = Math.max(0, Math.min(1, Number($('fillet').value) / 100));

    $('generateBtn').disabled = true;
    $('generateBtn').textContent = 'Generating...';

    try {
      const geometry = await buildDualTextGeometry({ wordA, wordB, fontUrl, size, height, padding, filletPct });

      const material = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.05 });
      latestMesh = new THREE.Mesh(geometry, material);

      // 1) Update live Three.js canvas
      preview.setGeometry(geometry);

      // 2) Enable downloads
      $('downloadStl').disabled = false;
      $('downloadGlb').disabled = false;

      // 3) Update model-viewer (guarded)
      const viewer = document.querySelector('model-viewer');
      if (!viewer) return;

      if (latestGlbBlobUrl) URL.revokeObjectURL(latestGlbBlobUrl);
      const glbBlob = await exportGLB(latestMesh);
      latestGlbBlobUrl = URL.createObjectURL(glbBlob);
      viewer.src = latestGlbBlobUrl;
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    } finally {
      $('generateBtn').disabled = false;
      $('generateBtn').textContent = 'Generate';
    }
  });

  $('downloadStl').addEventListener('click', () => {
    if (!latestMesh) return;
    const blob = exportSTL(latestMesh);
    downloadBlob(blob, 'dual-text-illusion.stl');
  });

  $('downloadGlb').addEventListener('click', async () => {
    if (!latestMesh) return;
    const blob = await exportGLB(latestMesh);
    downloadBlob(blob, 'dual-text-illusion.glb');
  });
}

main();
