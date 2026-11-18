// A racing world (GDD 5.7.4, world racing): a planet half the size of the
// worldship that came for Terra, with a drive bored through it.
//
// The planet is the chapter's layered planet (world/layerplanet.js) in the
// layers its entry in RACE.worlds names. Round its waist is the collar the
// drive is hung in, and out of its stern comes the wake: a cone of light in
// the drive's colour, longer and brighter the faster it is going.
//
//   const r = createRacer(world);         world: an entry of RACE.worlds
//   r.group                               place and turn this (it points down -z)
//   r.tick(t, px, speed01, boost01)       once a frame

import * as THREE from 'three';
import { createLayerPlanet } from './layerplanet.js';

export const RACER_R = 5.5;

// `lite`: a rival's, seen from further off: coarser, and nothing living on it.
export function createRacer(world, lite = false) {
  const group = new THREE.Group();
  const planet = createLayerPlanet(RACER_R, { life: lite ? 4 : 160, seg: lite ? 32 : 48, seed: world.id.length * 3.1 + world.speed * 7 });
  planet.setAll(world.layers);
  planet.revealAll(1);
  planet.holo(0.22); // (a little of its own light, so its night side is not a hole in the sky)
  planet.group.rotation.z = 0.3;
  group.add(planet.group);
  const drive = new THREE.Color(world.drive);
  // the collar, the bore through the middle, and the bell at the stern
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c222a, emissive: 0x0c0f14 });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(RACER_R * 1.06, 0.42, 8, 40), dark);
  group.add(collar);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(RACER_R * 0.34, RACER_R * 0.5, RACER_R * 0.7, 20, 1, true).rotateX(Math.PI / 2), dark);
  bell.position.z = RACER_R * 1.05;
  group.add(bell);
  const glowMat = new THREE.MeshBasicMaterial({ color: drive.clone().multiplyScalar(2.2), fog: false, toneMapped: false });
  const core = new THREE.Mesh(new THREE.CircleGeometry(RACER_R * 0.33, 20), glowMat);
  core.position.z = RACER_R * 1.2;
  group.add(core);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), glowMat);
    lamp.position.set(Math.cos(a) * RACER_R * 1.06, Math.sin(a) * RACER_R * 1.06, 0);
    collar.add(lamp);
  }
  // the wake
  const wakeU = { uTime: { value: 0 }, uCol: { value: drive }, uPower: { value: 0 } };
  const wake = new THREE.Mesh(
    new THREE.CylinderGeometry(RACER_R * 0.3, RACER_R * 1.5, 1, 20, 12, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    new THREE.ShaderMaterial({
      uniforms: wakeU,
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vN2;
        varying vec3 vW2;
        void main() {
          vAlong = position.z;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW2 = w.xyz;
          vN2 = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uPower;
        uniform vec3 uCol;
        varying float vAlong;
        varying vec3 vN2;
        varying vec3 vW2;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vN2), normalize(cameraPosition - vW2))), 1.4);
          float streak = 0.65 + 0.35 * sin(vAlong * 34.0 - uTime * 22.0);
          float fade = (1.0 - vAlong) * (1.0 - vAlong);
          gl_FragColor = vec4((uCol * 1.6 + 0.25) * fade * (0.3 + rim) * streak * (0.35 + 1.4 * uPower), 1.0);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  wake.position.z = RACER_R * 1.25;
  wake.frustumCulled = false;
  group.add(wake);

  return {
    group,
    tick(t, px, speed01, boost01) {
      planet.group.rotation.y = t * 0.5;
      planet.tick(t, px);
      collar.rotation.z = -t * (1.5 + 6 * speed01);
      wakeU.uTime.value = t;
      wakeU.uPower.value = 0.25 * speed01 + boost01;
      wake.scale.set(1 + 0.3 * boost01, 1 + 0.3 * boost01, RACER_R * (5 + 9 * speed01 + 14 * boost01));
      glowMat.color.copy(drive).multiplyScalar(1.6 + 1.6 * boost01);
    },
    dispose() {
      planet.dispose();
      group.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
