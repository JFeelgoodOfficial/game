import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { fbm, ridged, smoothstep, clamp, lerp } from './noise';
import { TERRAIN_SEG, PEAK_COUNT, WATER_TEX_SIZE } from './config';

export const WATER_LEVEL = 0;
export const WORLD_RADIUS = 460;          // playable soft boundary
export const POND = { x: 58, z: 30, r: 46, depth: 9.5 };

// ---------------------------------------------------------------------------
// Height field — single source of truth for mesh + runtime ground queries
// ---------------------------------------------------------------------------
export function terrainHeight(x: number, z: number): number {
  // Rolling golden hills
  let h = fbm(x * 0.0062, z * 0.0062, 5) * 11.5 + 5.2;
  h += fbm(x * 0.032, z * 0.032, 3) * 1.7;

  const r = Math.hypot(x, z);

  // Dramatic mountain rim enclosing the world
  const m = smoothstep(230, 430, r);
  if (m > 0) {
    const rg = ridged(x * 0.0038 + 11.3, z * 0.0038 - 6.1, 4);
    h += m * (rg * rg * 165 + 22 * m);
  }

  // Carve the pond basin
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r) {
    const pm = 1 - smoothstep(POND.r * 0.42, POND.r, pd);
    h -= pm * POND.depth;
  }

  // Guarantee dry land elsewhere (soft-clamp anything below the shoreline)
  if (h < WATER_LEVEL + 0.55) {
    const pd2 = Math.hypot(x - POND.x, z - POND.z);
    if (pd2 > POND.r * 0.95) {
      h = WATER_LEVEL + 0.55 + (h - WATER_LEVEL - 0.55) * 0.12;
    }
  }

  // gentle open meadow around the spawn point
  const sr = Math.hypot(x, z);
  if (sr < 26) {
    h = lerp(4.6, h, smoothstep(8, 26, sr));
  }
  return h;
}

export function terrainNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.9;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  out.set(hL - hR, 2 * e, hD - hU).normalize();
  return out;
}

export function slopeAt(x: number, z: number): number {
  return 1 - terrainNormal(x, z).y; // 0 = flat, ~1 = vertical
}

// Water depth at a point (0 when on land)
export function waterDepth(x: number, z: number): number {
  const g = terrainHeight(x, z);
  return g < WATER_LEVEL ? WATER_LEVEL - g : 0;
}

// ---------------------------------------------------------------------------
// Terrain mesh with hand-painted vertex colors
// ---------------------------------------------------------------------------
const cGrassA = new THREE.Color('#bf9432'); // golden autumn grass
const cGrassB = new THREE.Color('#97742c');
const cGrassC = new THREE.Color('#7d7a33'); // olive patches
const cMeadow = new THREE.Color('#ab8f3a');
const cSand   = new THREE.Color('#c2a878');
const cRock   = new THREE.Color('#7d7a74');
const cRockHi = new THREE.Color('#8f8b84');
const cSnow   = new THREE.Color('#f4f6f8');
const cSnowSh = new THREE.Color('#dfe7ee');

export function createTerrain(scene: THREE.Scene): THREE.Mesh {
  const SIZE = 940;
  const SEG = TERRAIN_SEG;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    terrainNormal(x, z, n);
    const slope = 1 - n.y;
    const patchNoise = fbm(x * 0.02 + 40, z * 0.02 - 17, 3);
    const grainNoise = fbm(x * 0.11 - 9, z * 0.11 + 23, 2);

    // Base: golden grass meadow with drifting patches
    col.copy(cGrassA);
    col.lerp(cGrassB, clamp(0.5 + patchNoise * 0.9, 0, 1));
    col.lerp(cGrassC, smoothstep(0.25, 0.75, grainNoise) * 0.55);
    col.lerp(cMeadow, smoothstep(-0.4, 0.6, fbm(x * 0.008, z * 0.008, 2)) * 0.4);

    // Sandy shoreline
    const shore = 1 - smoothstep(WATER_LEVEL + 0.35, WATER_LEVEL + 1.5, h);
    col.lerp(cSand, shore * 0.85);

    // Exposed rock on steep slopes
    const rocky = smoothstep(0.28, 0.5, slope + grainNoise * 0.06);
    col.lerp(slope > 0.5 ? cRock : cRockHi, rocky);

    // Snow caps — altitude + noise, recedes on steep warm faces
    const snowLine = 58 + patchNoise * 14;
    const snow = smoothstep(snowLine, snowLine + 9, h) * (1 - smoothstep(0.55, 0.8, slope) * 0.4);
    col.lerp(Math.random() > 0.5 ? cSnow : cSnowSh, snow);

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Reflective pond (three.js Water with real planar reflection)
// ---------------------------------------------------------------------------
function makeWaterNormalsTexture(): THREE.DataTexture {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      hgt[y * S + x] = fbm(x * 0.06, y * 0.06, 4);
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
      const dy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
      const nx = -dx * 3.2, ny = -dy * 3.2, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      data[i * 4] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i * 4 + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i * 4 + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createWater(scene: THREE.Scene): { update: (t: number) => void } {
  const geo = new THREE.CircleGeometry(POND.r * 1.12, 64);
  const water = new Water(geo, {
    textureWidth: WATER_TEX_SIZE,
    textureHeight: WATER_TEX_SIZE,
    waterNormals: makeWaterNormalsTexture(),
    sunDirection: new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
    sunColor: 0xffe9c4,
    waterColor: 0x0a3f38,
    distortionScale: 1.8,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_LEVEL, POND.z);
  scene.add(water);
  return {
    update: (t: number) => {
      (water.material as THREE.ShaderMaterial).uniforms.time.value = t * 0.55;
    },
  };
}

// ---------------------------------------------------------------------------
// Distant snow-peak silhouettes beyond the playable rim
// ---------------------------------------------------------------------------
export function createBackdropPeaks(scene: THREE.Scene): void {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8a8f9c', roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: '#eef2f6', roughness: 0.9, flatShading: true });

  const COUNT = PEAK_COUNT;
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2 + fbm(i * 3.1, 7.7, 1) * 0.3;
    const dist = 640 + fbm(i * 1.7, 3.3, 2) * 130;
    const hgt = 230 + Math.abs(fbm(i * 2.3, 11.1, 2)) * 210;
    const rad = hgt * (0.85 + Math.abs(fbm(i, i * 2, 1)) * 0.5);

    const geo = new THREE.ConeGeometry(rad, hgt, 7, 4);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
      const d = fbm(vx * 0.02 + i * 9, vz * 0.02 - i * 5, 3) * rad * 0.16;
      p.setX(v, vx + d);
      p.setZ(v, vz + d * 0.7);
      p.setY(v, vy + fbm(vx * 0.03, vz * 0.03 + i, 2) * hgt * 0.05);
    }
    geo.computeVertexNormals();

    const peak = new THREE.Mesh(geo, rockMat);
    // snow cap
    const capGeo = new THREE.ConeGeometry(rad * 0.42, hgt * 0.42, 7, 2);
    const cap = new THREE.Mesh(capGeo, snowMat);
    cap.position.y = hgt * 0.29;
    peak.add(cap);

    peak.position.set(Math.cos(a) * dist, hgt * 0.5 - 30, Math.sin(a) * dist);
    peak.rotation.y = fbm(i, 0, 1) * Math.PI;
    group.add(peak);
  }
  scene.add(group);
}

// Shared color helpers for vegetation
export const AUTUMN = {
  gold: new THREE.Color('#d9a13b'),
  amber: new THREE.Color('#c97b2d'),
  rust: new THREE.Color('#a85a24'),
  green: new THREE.Color('#5d7038'),
  deepGreen: new THREE.Color('#40512c'),
};

export function mixAutumn(t: number): THREE.Color {
  const c = new THREE.Color();
  if (t < 0.45) c.copy(AUTUMN.green).lerp(AUTUMN.gold, t / 0.45);
  else if (t < 0.8) c.copy(AUTUMN.gold).lerp(AUTUMN.amber, (t - 0.45) / 0.35);
  else c.copy(AUTUMN.amber).lerp(AUTUMN.rust, (t - 0.8) / 0.2);
  return c;
}

export { clamp, lerp, smoothstep };
