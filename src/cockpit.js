// Cockpit (GDD 4.3). Geometry only: canopy struts, a dashboard, side
// consoles, and sills, with one interior light so a highlight travels the
// frame as the ship rotates. The forward view stays clear — the bulk of the
// interior sits low and to the sides, revealed when the camera pulls back on
// boost (camera.js). No instruments, no HUD (the dashboard glow strips are
// diegetic geometry, not readouts).
//
// Lives in its own scene, composited over the lensed world by
// CockpitOverlayPass so gravitational lensing never warps the interior.
// Posed every frame from the SHIP's transform — the camera lags the ship
// (camera.js), and that gap is what makes the cockpit read as a vehicle
// you sit inside rather than an overlay.

import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { C } from './constants.js';

export const cockpitScene = new THREE.Scene();

const group = new THREE.Group();

const frameMat = new THREE.MeshStandardMaterial({
  color: 0x2b313b,
  roughness: 0.42,
  metalness: 0.6,
});
const panelMat = new THREE.MeshStandardMaterial({
  color: 0x20242c,
  roughness: 0.6,
  metalness: 0.4,
});
// Diegetic instrument glow — emissive so it blooms faintly (GDD 4.4).
const glowMat = new THREE.MeshBasicMaterial({ color: C.ACCENT });

// Two A-pillar struts converging ahead, crossing the view's upper corners.
const strutGeo = new THREE.BoxGeometry(0.022, 1.5, 0.035);
const strutL = new THREE.Mesh(strutGeo, frameMat);
strutL.position.set(-0.44, 0.2, -0.7);
strutL.rotation.set(0.75, 0.12, 0.55);
const strutR = new THREE.Mesh(strutGeo, frameMat);
strutR.position.set(0.44, 0.2, -0.7);
strutR.rotation.set(0.75, -0.12, -0.55);

// Top canopy brace across the upper frame.
const brace = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.03), frameMat);
brace.position.set(0, 0.52, -0.82);
brace.rotation.x = -0.25;

// Dashboard: a low console angled UP toward the pilot (its lit face and glow
// strips face you), sitting below the view so you look over it rather than
// into a wall. This is where the tuning hologram projects from.
const dashFace = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.04), panelMat);
dashFace.position.set(0, -0.82, -0.5);
dashFace.rotation.x = -0.5; // top tips back toward the pilot; face aims up-forward
const dashLip = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 0.14), frameMat);
dashLip.position.set(0, -0.56, -0.64);
dashLip.rotation.x = 0.45;
// glow strips laid on the console face (offset along its normal so they show)
const glowGeo = new THREE.BoxGeometry(0.36, 0.016, 0.016);
const glowL = new THREE.Mesh(glowGeo, glowMat);
glowL.position.set(-0.46, -0.74, -0.4);
glowL.rotation.x = -0.5;
const glowR = glowL.clone();
glowR.position.x = 0.46;
const glowC = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.014, 0.014), glowMat);
glowC.position.set(0, -0.68, -0.44);
glowC.rotation.x = -0.5;

// Side consoles: angled panels down the lower left/right, close to the pilot.
const consoleGeo = new THREE.BoxGeometry(0.34, 0.5, 0.02);
const consoleL = new THREE.Mesh(consoleGeo, panelMat);
consoleL.position.set(-0.72, -0.42, -0.34);
consoleL.rotation.set(0.2, 0.9, 0.1);
const consoleR = new THREE.Mesh(consoleGeo, panelMat);
consoleR.position.set(0.72, -0.42, -0.34);
consoleR.rotation.set(0.2, -0.9, -0.1);

// Canopy sills: rails along the lower left/right edges.
const sillGeo = new THREE.BoxGeometry(0.04, 0.04, 0.9);
const sillL = new THREE.Mesh(sillGeo, frameMat);
sillL.position.set(-0.66, -0.4, -0.4);
sillL.rotation.y = 0.25;
const sillR = new THREE.Mesh(sillGeo, frameMat);
sillR.position.set(0.66, -0.4, -0.4);
sillR.rotation.y = -0.25;

// Seat surround: a low frame behind/below the pilot, seen when pulled back.
const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.06), panelMat);
seat.position.set(0, -0.2, 0.32);
seat.rotation.x = -0.2;

group.add(
  strutL, strutR, brace, dashFace, dashLip, glowL, glowR, glowC,
  consoleL, consoleR, sillL, sillR, seat
);

// One interior light, low and to the side, so glints travel along the
// struts during rotation. The moving highlight sells the interior
// (GDD 4.3) — bright enough to read, dim enough to stay under the bloom
// threshold (GDD 4.4).
const light = new THREE.PointLight(0xffe8d0, 3.2, 8.0, 2.0);
light.position.set(0.3, -0.35, -0.15);
group.add(light);

cockpitScene.add(group);
cockpitScene.add(new THREE.AmbientLight(0x5a6480, 2.0));

export function updateCockpit(ship) {
  group.position.copy(ship.position);
  group.quaternion.copy(ship.quaternion);
  glowMat.color.set(C.ACCENT);
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
