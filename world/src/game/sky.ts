import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fbm } from './noise';
import { SHADOWS } from './config';

export interface SkyRig {
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  updateShadowTarget: (p: THREE.Vector3) => void;
}

export function createSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): SkyRig {
  // Atmosphere
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - 38), // elevation 38°
    THREE.MathUtils.degToRad(128),     // azimuth
  );
  const u = sky.material.uniforms;
  u.turbidity.value = 6.5;
  u.rayleigh.value = 1.8;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  scene.fog = new THREE.Fog(0xddd6c6, 150, 1150);

  // Key light — warm afternoon sun
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.castShadow = SHADOWS;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 420;
  const EXT = 95;
  sun.shadow.camera.left = -EXT;
  sun.shadow.camera.right = EXT;
  sun.shadow.camera.top = EXT;
  sun.shadow.camera.bottom = -EXT;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  scene.add(sun);
  scene.add(sun.target);

  // Fill — sky bounce
  const hemi = new THREE.HemisphereLight(0xbdd4ec, 0x9a7f4e, 0.85);
  scene.add(hemi);

  // Environment map for the helmet visor & suit sheen
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  return {
    sun,
    sunDir,
    updateShadowTarget: (p: THREE.Vector3) => {
      sun.target.position.copy(p);
      sun.position.copy(p).addScaledVector(sunDir, 190);
    },
  };
}

// ---------------------------------------------------------------------------
// Drifting cumulus clouds — soft billboard sprites
// ---------------------------------------------------------------------------
function makeCloudTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const rand = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  for (let i = 0; i < 46; i++) {
    const cx = S / 2 + (rand() - 0.5) * S * 0.62;
    const cy = S / 2 + (rand() - 0.5) * S * 0.34;
    const r = 14 + rand() * 42;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const a = 0.10 + rand() * 0.16;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(255,252,246,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createClouds(scene: THREE.Scene): { update: (dt: number) => void } {
  const tex = makeCloudTexture();
  const group = new THREE.Group();
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < 22; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.5 + Math.abs(fbm(i * 3.3, 1.1, 1)) * 0.4,
      depthWrite: false,
      fog: false,
    });
    const sp = new THREE.Sprite(mat);
    const a = (i / 22) * Math.PI * 2 + fbm(i, 5, 1);
    const r = 260 + Math.abs(fbm(i * 1.3, 9.7, 2)) * 700;
    sp.position.set(Math.cos(a) * r, 190 + Math.abs(fbm(i * 2.1, 4.4, 2)) * 160, Math.sin(a) * r);
    const s = 260 + Math.abs(fbm(i * 0.9, 2.2, 2)) * 340;
    sp.scale.set(s, s * 0.42, 1);
    group.add(sp);
    sprites.push(sp);
  }
  scene.add(group);
  return {
    update: (dt: number) => {
      group.rotation.y += dt * 0.0022;
    },
  };
}
