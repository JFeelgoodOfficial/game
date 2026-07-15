// Black hole (GDD 4.5). The best-value item in the project: a black horizon
// sphere, an additive accretion disk in differential rotation, a photon
// ring + screen-space lensing (shaders/lensing.frag, wired in main.js), and
// a mass registered in gravity.js like any body.
//
// No radius is given to the gravity body, so the altitude floor never
// applies: the horizon is not a hazard. Falling in does nothing; death does
// not exist in this project.

import * as THREE from 'three';
import { C } from './constants.js';
import { addBody } from './gravity.js';
import { addShiftable } from './origin.js';
import accretionFrag from './shaders/accretion.frag?raw';

const DISK_VERT = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const blackhole = {
  group: null,
  body: null,
  diskMat: null,
};

export function initBlackHole(scene) {
  const group = new THREE.Group();
  // Off-axis from the spawn line to the test mass: ahead, right, slightly
  // up — a small lensed glint you can chase.
  group.position.set(0.52, 0.14, -0.84).normalize().multiplyScalar(C.BH_DISTANCE);

  // Event horizon: pure black sphere. The lensing pass draws the true black
  // disk; this guarantees the hole stays black even where the pass is off.
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(C.BH_HORIZON, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );

  // Accretion disk: flat annulus, additive, differential rotation.
  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: accretionFrag,
    uniforms: {
      uTime: { value: 0 },
      uRh: { value: C.BH_HORIZON },
      uInner: { value: C.DISK_INNER },
      uOuter: { value: C.DISK_OUTER },
      uAccent: { value: new THREE.Color(C.ACCENT) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(C.DISK_INNER * C.BH_HORIZON, C.DISK_OUTER * C.BH_HORIZON, 128, 1),
    diskMat
  );
  disk.rotation.x = -Math.PI / 2 + 0.42; // tilted so it reads from the spawn line

  group.add(horizon, disk);
  scene.add(group);
  addShiftable(group);

  blackhole.group = group;
  blackhole.diskMat = diskMat;
  blackhole.body = addBody({ position: group.position, mass: C.BH_MASS });
}

const _view = new THREE.Vector3();
const _ndc = new THREE.Vector3();

// Per-frame: animate the disk, keep the mass panel-tunable, and feed the
// lensing pass the BH's screen position and apparent horizon size.
export function updateBlackHole(camera, lensUniforms, time) {
  blackhole.body.mass = C.BH_MASS;

  const u = blackhole.diskMat.uniforms;
  u.uTime.value = time;
  u.uRh.value = C.BH_HORIZON;
  u.uInner.value = C.DISK_INNER;
  u.uOuter.value = C.DISK_OUTER;
  u.uAccent.value.set(C.ACCENT);

  // View-space position: camera looks down -z; behind the camera -> disable.
  _view.copy(blackhole.group.position).applyMatrix4(camera.matrixWorldInverse);
  if (_view.z >= -1.0) {
    lensUniforms.uEnabled.value = 0;
    return;
  }
  const dist = _view.length();
  _ndc.copy(blackhole.group.position).project(camera);
  lensUniforms.uBH.value.set(_ndc.x * 0.5 + 0.5, _ndc.y * 0.5 + 0.5);
  // apparent horizon radius in vertical-uv units
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  lensUniforms.uRh.value = C.BH_HORIZON / (dist * 2.0 * halfTan);
  lensUniforms.uStrength.value = C.LENS_STRENGTH;
  lensUniforms.uEnabled.value = 1;
}
