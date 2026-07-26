// Nebula (GDD 4.2). Inverted sphere, layered value noise. Follows the
// camera every frame; shading is by view direction, so the sky never gets
// closer and never moves except by rotation.
//
// Audit fix: the noise shader (~80 hash lookups per pixel) used to run
// full-screen every frame even though the sky is static. It is now rendered
// ONCE into a cubemap at init and the per-frame sphere just samples it —
// one texture tap per pixel. Intensity stays live (a uniform on the sampling
// shader); changing the accent colour (dev tuning) re-bakes.

import * as THREE from 'three';
import { C } from './constants.js';
import nebulaFrag from './shaders/nebula.frag?raw';

const VERT = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SAMPLE_FRAG = /* glsl */ `
  varying vec3 vPos;
  uniform samplerCube uSky;
  uniform float uIntensity;
  void main() {
    gl_FragColor = textureCube(uSky, normalize(vPos)) * uIntensity;
  }
`;

let mesh = null;
let bakeScene = null;
let bakeMesh = null;
let cubeCam = null;
let cubeTarget = null;
let rendererRef = null;
let bakedAccent = null;

function bake() {
  bakedAccent = C.ACCENT;
  bakeMesh.material.uniforms.uAccent.value.set(C.ACCENT);
  cubeCam.update(rendererRef, bakeScene);
}

export function initNebula(scene, renderer) {
  rendererRef = renderer;

  // the original noise shader lives in a tiny bake-only scene
  bakeScene = new THREE.Scene();
  bakeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: nebulaFrag,
      uniforms: {
        uAccent: { value: new THREE.Color(C.ACCENT) },
        uIntensity: { value: 1.0 }, // baked flat; live intensity is applied at sample time
      },
      side: THREE.BackSide,
    })
  );
  bakeScene.add(bakeMesh);

  cubeTarget = new THREE.WebGLCubeRenderTarget(512, {
    type: THREE.HalfFloatType, // the sky is mostly near-black; 8-bit would band
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  bake();

  mesh = new THREE.Mesh(
    new THREE.SphereGeometry(4.0e5, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SAMPLE_FRAG,
      uniforms: {
        uSky: { value: cubeTarget.texture },
        uIntensity: { value: C.NEBULA_INTENSITY },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10; // painted first; everything draws over it
  scene.add(mesh);
}

// Hide/show the sky shell (src/isolate.js — story planets author their own sky).
export function setNebulaVisible(v) {
  if (mesh) mesh.visible = v;
}

export function updateNebula(camera) {
  mesh.position.copy(camera.position);
  mesh.material.uniforms.uIntensity.value = C.NEBULA_INTENSITY;
  if (C.ACCENT !== bakedAccent) bake(); // dev tuning panel changed the accent
}
