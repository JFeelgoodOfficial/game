// Nebula (GDD 4.2). Inverted sphere, fragment shader, layered value noise.
// Follows the camera every frame; shading is by view direction, so the sky
// never gets closer and never moves except by rotation.

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

let mesh = null;
const _accent = new THREE.Color();

export function initNebula(scene) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: nebulaFrag,
    uniforms: {
      uAccent: { value: new THREE.Color(C.ACCENT) },
      uIntensity: { value: C.NEBULA_INTENSITY },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  mesh = new THREE.Mesh(new THREE.SphereGeometry(4.0e5, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10; // painted first; everything draws over it
  scene.add(mesh);
}

export function updateNebula(camera) {
  mesh.position.copy(camera.position);
  mesh.material.uniforms.uIntensity.value = C.NEBULA_INTENSITY;
  mesh.material.uniforms.uAccent.value.set(C.ACCENT);
}
