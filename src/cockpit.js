// Cockpit (GDD 4.3). Geometry only: two canopy struts crossing the view, a
// dashboard lip along the bottom edge, one interior light positioned to
// catch the struts as the ship rotates. The moving highlight on the strut
// sells the interior. No instruments, no HUD.
//
// Lives in its own scene, composited over the lensed world by
// CockpitOverlayPass so gravitational lensing never warps the interior.
// Posed every frame from the SHIP's transform — the camera lags the ship
// (camera.js), and that gap is what makes the cockpit read as a vehicle
// you sit inside rather than an overlay.

import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

export const cockpitScene = new THREE.Scene();

const group = new THREE.Group();

const frameMat = new THREE.MeshStandardMaterial({
  color: 0x232830,
  roughness: 0.42,
  metalness: 0.6,
});

// Two A-pillar struts converging ahead, crossing the view's upper corners.
const strutGeo = new THREE.BoxGeometry(0.022, 1.5, 0.035);
const strutL = new THREE.Mesh(strutGeo, frameMat);
strutL.position.set(-0.44, 0.2, -0.7);
strutL.rotation.set(0.75, 0.12, 0.55);
const strutR = new THREE.Mesh(strutGeo, frameMat);
strutR.position.set(0.44, 0.2, -0.7);
strutR.rotation.set(0.75, -0.12, -0.55);

// Dashboard lip along the bottom edge, tilted toward the pilot.
const dash = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.34), frameMat);
dash.position.set(0, -0.46, -0.62);
dash.rotation.x = 0.35;

// Canopy sill: thin rails along the lower left/right edges.
const sillGeo = new THREE.BoxGeometry(0.04, 0.04, 0.9);
const sillL = new THREE.Mesh(sillGeo, frameMat);
sillL.position.set(-0.66, -0.4, -0.4);
sillL.rotation.y = 0.25;
const sillR = new THREE.Mesh(sillGeo, frameMat);
sillR.position.set(0.66, -0.4, -0.4);
sillR.rotation.y = -0.25;

group.add(strutL, strutR, dash, sillL, sillR);

// One interior light, low and to the side, so glints travel along the
// struts during rotation. The moving highlight sells the interior
// (GDD 4.3) — bright enough to read, dim enough to stay under the bloom
// threshold (GDD 4.4).
const light = new THREE.PointLight(0xffe8d0, 3.2, 8.0, 2.0);
light.position.set(0.42, -0.3, -0.3);
group.add(light);

cockpitScene.add(group);
cockpitScene.add(new THREE.AmbientLight(0x46506a, 1.4));

export function updateCockpit(ship) {
  group.position.copy(ship.position);
  group.quaternion.copy(ship.quaternion);
}

// Renders the cockpit scene on top of the current composer buffer (depth
// cleared, color kept), then lets the next pass read the result in place.
export class CockpitOverlayPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = oldAutoClear;
  }
}
