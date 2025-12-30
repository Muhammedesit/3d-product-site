// Frontend-only MVP generator.
// Goal: produce a clean "dual-text illusion" style solid from two words, previewable as GLB and downloadable as STL.
// This is implemented from scratch using Three.js primitives (no proprietary generators).

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.160.0/examples/jsm/geometries/TextGeometry.js';
import { BufferGeometryUtils } from 'https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'https://unpkg.com/three@0.160.0/examples/jsm/exporters/GLTFExporter.js';

// STL exporter isn't in core; it's part of examples and is license-safe (Three.js examples are MIT).
import { STLExporter } from 'https://unpkg.com/three@0.160.0/examples/jsm/exporters/STLExporter.js';

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

  geoA.computeBoundingBox();
  geoB.computeBoundingBox();

  // Center them around origin and add padding by translating a bit
  const centerGeometry = (g) => {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const cx = (bb.max.x + bb.min.x) / 2;
    const cy = (bb.max.y + bb.min.y) / 2;
    // Z is [0, depth]
    g.translate(-cx, -cy, -height / 2);
  };

  centerGeometry(geoA);
  centerGeometry(geoB);

  // Create illusion by rotating wordB 90 degrees around Y.
  // When viewed from front: A reads. From side: B reads.
  geoB.rotateY(Math.PI / 2);

  // Slight offset to reduce z-fighting / coincident faces; padding influences separation.
  geoA.translate(0, 0, 0);
  geoB.translate(padding, 0, 0);

  // Merge (boolean-like approximation): just merge buffer geometry.
  // For MVP: accuracy over perfection; downstream slicers will union overlapping volumes.
  const merged = BufferGeometryUtils.mergeGeometries(
    [new THREE.BufferGeometry().fromGeometry?.(geoA), new THREE.BufferGeometry().fromGeometry?.(geoB)].map((g, i) => {
      // Compatibility: TextGeometry is already BufferGeometry in newer Three but keep safe.
      // If it already is BufferGeometry, keep it.
      const gg = (geoA.isBufferGeometry ? (i === 0 ? geoA : geoB) : g);
      gg.computeVertexNormals();
      return gg;
    }),
    true
  );

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

  const material = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.35, metalness: 0.05 });

  function setGeometry(geometry) {
    if (mesh) {
      mesh.geometry.dispose();
      scene.remove(mesh);
    }
    mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

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

  const fontMap = {
    // Note: helvetiker comes from Three.js examples (MIT). This keeps the MVP license-safe.
    helvetiker: 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json',
    optimer: 'https://unpkg.com/three@0.160.0/examples/fonts/optimer_regular.typeface.json',
    gentilis: 'https://unpkg.com/three@0.160.0/examples/fonts/gentilis_regular.typeface.json'
  };

  function updateFontWeightOptions() {
    // For MVP, keep a single variant per font. The UI includes variant selector for future expansion.
    const variant = $('fontVariant');
    variant.innerHTML = '';
    variant.appendChild(new Option('Regular', 'regular'));
  }

  $('font').addEventListener('change', updateFontWeightOptions);
  updateFontWeightOptions();

  $('generateBtn').addEventListener('click', async () => {
    setError(null);

    const wordA = normalizeWord($('wordA').value);
    const wordB = normalizeWord($('wordB').value);

    const err = validateInputs(wordA, wordB);
    if (err) return setError(err);

    const fontKey = $('font').value;
    const fontUrl = fontMap[fontKey] || fontMap.helvetiker;

    const size = Number($('fontSize').value);
    const height = Number($('extrudeHeight').value);
    const padding = Number($('padding').value);
    const filletPct = Math.max(0, Math.min(1, Number($('fillet').value) / 100));

    $('generateBtn').disabled = true;
    $('generateBtn').textContent = 'Generating...';

    try {
      const geometry = await buildDualTextGeometry({ wordA, wordB, fontUrl, size, height, padding, filletPct });

      // Ensure geometry is indexed and merged cleanly.
      const material = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.35, metalness: 0.05 });
      latestMesh = new THREE.Mesh(geometry, material);

      preview.setGeometry(geometry);

      $('downloadStl').disabled = false;
      $('downloadGlb').disabled = false;

      // Update <model-viewer> preview by exporting GLB
      if (latestGlbBlobUrl) URL.revokeObjectURL(latestGlbBlobUrl);
      const glbBlob = await exportGLB(latestMesh);
      latestGlbBlobUrl = URL.createObjectURL(glbBlob);
      $('modelViewer').src = latestGlbBlobUrl;
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
