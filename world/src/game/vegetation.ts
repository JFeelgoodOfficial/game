import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './noise';
import { terrainHeight, slopeAt, WATER_LEVEL, mixAutumn } from './terrain';
import { GRASS_COUNT, TREE_PER_VARIANT, SHRUB_COUNT, ROCK_PER_VARIANT } from './config';

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Golden grass field — instanced blades with vertex-shader wind sway
// ---------------------------------------------------------------------------
export function createGrass(scene: THREE.Scene): { update: (t: number) => void } {
  const rand = mulberry(42);

  // Tapered blade, base at y=0, gradient vertex colors (dark root -> golden tip)
  const geo = new THREE.PlaneGeometry(0.26, 1, 1, 3);
  geo.translate(0, 0.5, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(p.count * 3);
  const root = new THREE.Color('#a8842f');
  const tip = new THREE.Color('#f7d06a');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * (1 - y * 0.85)); // taper
    c.copy(root).lerp(tip, y * y);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#c9a24a'),
    emissiveIntensity: 0.42,
  });

  const timeUniform = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.7 + ip.x * 0.32 + ip.z * 0.41) * 0.6
                   + sin(uTime * 3.3 + ip.x * 0.83 - ip.z * 0.52) * 0.25;
        float bend = transformed.y * transformed.y;
        transformed.x += sway * 0.16 * bend;
        transformed.z += sway * 0.09 * bend;
      }`
    );
  };

  const COUNT = GRASS_COUNT;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.frustumCulled = false;
  // no shadow casting/receiving — keeps the field bright golden and cheap
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < COUNT && attempts < COUNT * 6) {
    attempts++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 175;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.45) continue;
    if (slopeAt(x, z) > 0.42) continue;
    // patchy meadow density
    if (fbm(x * 0.02, z * 0.02, 2) < -0.55) continue;

    dummy.position.set(x, h - 0.03, z);
    dummy.rotation.y = rand() * Math.PI;
    const s = 0.38 + rand() * 0.42;
    dummy.scale.set(s * (0.9 + rand() * 0.6), s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    tint.setHSL(0.105 + rand() * 0.03, 0.6 + rand() * 0.2, 0.55 + rand() * 0.2);
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return { update: (t: number) => { timeUniform.value = t; } };
}

// ---------------------------------------------------------------------------
// Trees — three autumn variants, merged trunk+canopy, instanced in forests
// ---------------------------------------------------------------------------
function buildTreeGeometry(kind: number, rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkMat = new THREE.Color('#5d4630');
  const trunkMat2 = new THREE.Color('#4b3826');

  const paintColor = (g: THREE.BufferGeometry, col: THREE.Color, jitter = 0) => {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.copy(col);
      if (jitter > 0) c.offsetHSL(0, 0, (rand() - 0.5) * jitter);
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };

  const trunkH = kind === 2 ? 5.2 : 3.6 + rand() * 1.2;
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, trunkH, 7);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(paintColor(trunk, rand() > 0.5 ? trunkMat : trunkMat2));

  // branches
  const branchN = kind === 2 ? 4 : 3;
  for (let b = 0; b < branchN; b++) {
    const br = new THREE.CylinderGeometry(0.05, 0.12, 1.6 + rand(), 5);
    br.translate(0, 0.8, 0);
    br.rotateZ(0.5 + rand() * 0.6);
    br.rotateY(rand() * Math.PI * 2);
    br.translate(0, trunkH * (0.55 + rand() * 0.3), 0);
    parts.push(paintColor(br, trunkMat2));
  }

  const blob = (r: number, x: number, y: number, z: number, col: THREE.Color) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const pp = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      const vx = pp.getX(i), vy = pp.getY(i), vz = pp.getZ(i);
      const d = fbm(vx * 0.9 + x * 7, vz * 0.9 + y * 5, 2) * r * 0.3;
      pp.setXYZ(i, vx + d, vy * 0.82 + d * 0.5, vz + d);
    }
    g.computeVertexNormals();
    g.translate(x, y, z);
    parts.push(paintColor(g, col, 0.09));
  };

  if (kind === 2) {
    // conifer — stacked dark-green cones keep a touch of alpine green
    const shades = [new THREE.Color('#44582c'), new THREE.Color('#51652f'), new THREE.Color('#3a4c27')];
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.ConeGeometry(2.2 - i * 0.62, 2.6, 8);
      cone.translate(0, trunkH * 0.72 + i * 1.7, 0);
      parts.push(paintColor(cone, shades[i % 3], 0.06));
    }
  } else {
    const baseCol = mixAutumn(kind === 0 ? 0.35 + rand() * 0.3 : 0.68 + rand() * 0.3);
    blob(2.3, 0, trunkH + 1.5, 0, baseCol);
    blob(1.7, 1.1, trunkH + 0.8, 0.5, baseCol.clone().offsetHSL(0.015, 0, 0.03));
    blob(1.5, -1.0, trunkH + 1.0, -0.4, baseCol.clone().offsetHSL(-0.015, 0, -0.03));
    if (rand() > 0.4) blob(1.1, 0.2, trunkH + 2.8, 0.2, baseCol.clone().offsetHSL(0.02, 0.05, 0.05));
  }

  // unify to non-indexed so cylinders/cones can merge with icosahedron blobs
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false)!;
  flat.forEach((g, i) => { if (g !== parts[i]) g.dispose(); });
  parts.forEach((g) => g.dispose());
  return merged;
}

export function createTrees(scene: THREE.Scene): void {
  const rand = mulberry(2024);
  const variants = [buildTreeGeometry(0, rand), buildTreeGeometry(1, rand), buildTreeGeometry(2, rand)];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  const perVariant = TREE_PER_VARIANT;
  const meshes = variants.map((g) => {
    const m = new THREE.InstancedMesh(g, mat, perVariant);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  const counts = [0, 0, 0];

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let attempts = 0;
  const target = perVariant * 3;
  let placed = 0;
  while (placed < target && attempts < target * 14) {
    attempts++;
    const a = rand() * Math.PI * 2;
    const r = 18 + Math.sqrt(rand()) * 330;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.7 || h > 60) continue;
    if (slopeAt(x, z) > 0.4) continue;

    // forest mask — dense clustered woods with clearings
    const forest = fbm(x * 0.011 + 7.3, z * 0.011 - 3.1, 3);
    const isConiferZone = h > 26 || r > 230;
    if (!isConiferZone && forest < 0.08) continue;
    if (isConiferZone && forest < -0.25) continue;

    let kind: number;
    if (isConiferZone) kind = rand() > 0.35 ? 2 : 0;
    else kind = rand() > 0.72 ? 2 : rand() > 0.5 ? 0 : 1;
    if (counts[kind] >= perVariant) continue;

    dummy.position.set(x, h - 0.15, z);
    dummy.rotation.y = rand() * Math.PI * 2;
    const s = (kind === 2 ? 1.1 : 0.9) + rand() * (kind === 2 ? 1.1 : 0.9);
    dummy.scale.set(s, s * (0.9 + rand() * 0.25), s);
    dummy.updateMatrix();
    meshes[kind].setMatrixAt(counts[kind], dummy.matrix);
    const v = 0.82 + rand() * 0.35;
    tint.setRGB(v, v, v);
    meshes[kind].setColorAt(counts[kind], tint);
    counts[kind]++;
    placed++;
  }
  meshes.forEach((m, i) => {
    m.count = counts[i];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------
// Shrubs — low autumn underbrush
// ---------------------------------------------------------------------------
export function createShrubs(scene: THREE.Scene): void {
  const rand = mulberry(555);
  const geo = new THREE.IcosahedronGeometry(0.7, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const d = fbm(vx * 2.1, vz * 2.1 + 3, 2) * 0.25;
    p.setXYZ(i, vx + d, Math.max(vy * 0.55, -0.1), vz + d);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const COUNT = SHRUB_COUNT;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let placed = 0, attempts = 0;
  while (placed < COUNT && attempts < COUNT * 8) {
    attempts++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 300;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.5 || h > 55) continue;
    if (slopeAt(x, z) > 0.45) continue;
    dummy.position.set(x, h, z);
    dummy.rotation.y = rand() * Math.PI * 2;
    const s = 0.7 + rand() * 1.6;
    dummy.scale.set(s, s * (0.6 + rand() * 0.5), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    col.copy(mixAutumn(rand())).offsetHSL(0, 0, (rand() - 0.5) * 0.1);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

// ---------------------------------------------------------------------------
// Scattered rocks & boulders
// ---------------------------------------------------------------------------
export function createRocks(scene: THREE.Scene): void {
  const rand = mulberry(909);
  const variants: THREE.BufferGeometry[] = [];
  for (let v = 0; v < 3; v++) {
    const g = new THREE.DodecahedronGeometry(1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const d = fbm(vx * 1.4 + v * 8, vz * 1.4 - v * 4, 2) * 0.35;
      p.setXYZ(i, vx + d, vy * 0.75 + d * 0.4, vz + d);
    }
    g.computeVertexNormals();
    variants.push(g);
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });

  const perVariant = ROCK_PER_VARIANT;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  variants.forEach((g) => {
    const mesh = new THREE.InstancedMesh(g, mat, perVariant);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    let placed = 0, attempts = 0;
    while (placed < perVariant && attempts < perVariant * 12) {
      attempts++;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 380;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < WATER_LEVEL - 0.5) continue;
      const sl = slopeAt(x, z);
      if (sl > 0.75) continue;
      const s = 0.35 + Math.pow(rand(), 2.2) * 3.4;
      dummy.position.set(x, h + s * 0.12, z);
      dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
      dummy.scale.set(s * (0.7 + rand() * 0.6), s * (0.55 + rand() * 0.5), s * (0.7 + rand() * 0.6));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      const gsh = 0.42 + rand() * 0.28;
      col.setRGB(gsh, gsh * (0.97 + rand() * 0.05), gsh * 0.94);
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  });
}
