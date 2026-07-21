// Cockpit shell (GDD 4.3). This module owns the cockpit overlay SCENE and the
// pass that composites it, plus the shared canopy-frame skeleton. The flyable
// 3D cockpit itself — window, console, dashboard buttons, steering wheel —
// is built in cockpit3d.js and added to cockpitScene from there.
//
// The scene is composited over the lensed world by CockpitOverlayPass so
// gravitational lensing never warps the interior. cockpit3d poses its rig
// every frame from the SHIP's transform — the camera lags the ship
// (camera.js), and that gap is what makes the cockpit read as a vehicle you
// sit inside rather than an overlay.

import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

export const cockpitScene = new THREE.Scene();

// The canopy skeleton, factored so the walkable interior (interior.js) can
// build the identical frame around its pilot seat — the forward view must
// match whether you're flying or standing behind the chair.
export function buildCanopyFrame(mat) {
  const g = new THREE.Group();

  // Two A-pillar struts converging ahead, crossing the view's upper corners.
  const strutGeo = new THREE.BoxGeometry(0.022, 1.5, 0.035);
  const strutL = new THREE.Mesh(strutGeo, mat);
  strutL.position.set(-0.44, 0.2, -0.7);
  strutL.rotation.set(0.75, 0.12, 0.55);
  const strutR = new THREE.Mesh(strutGeo, mat);
  strutR.position.set(0.44, 0.2, -0.7);
  strutR.rotation.set(0.75, -0.12, -0.55);

  // Top canopy brace across the upper frame.
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.03), mat);
  brace.position.set(0, 0.52, -0.82);
  brace.rotation.x = -0.25;

  // Canopy sills: rails along the lower left/right edges (kept low, out of
  // the forward view).
  const sillGeo = new THREE.BoxGeometry(0.04, 0.04, 0.9);
  const sillL = new THREE.Mesh(sillGeo, mat);
  sillL.position.set(-0.66, -0.44, -0.4);
  sillL.rotation.y = 0.25;
  const sillR = new THREE.Mesh(sillGeo, mat);
  sillR.position.set(0.66, -0.44, -0.4);
  sillR.rotation.y = -0.25;

  g.add(strutL, strutR, brace, sillL, sillR);

  // Overhead window: a rectangular frame above and slightly behind the
  // brace, tilted with the canopy line, seen by holding V. The opening is
  // empty — the overlay pass clears depth only, so space shows through.
  const oh = new THREE.Group();
  const OW = 0.7; // opening width
  const OD = 0.5; // opening depth (along the tilted canopy)
  const railGeo = new THREE.BoxGeometry(OW + 0.06, 0.03, 0.03);
  const railF = new THREE.Mesh(railGeo, mat);
  railF.position.z = -OD / 2;
  const railB = new THREE.Mesh(railGeo, mat);
  railB.position.z = OD / 2;
  const sideGeo = new THREE.BoxGeometry(0.03, 0.03, OD);
  const sideL = new THREE.Mesh(sideGeo, mat);
  sideL.position.x = -OW / 2;
  const sideR = new THREE.Mesh(sideGeo, mat);
  sideR.position.x = OW / 2;
  // one center rib so the pane reads as glazed, not missing
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, OD), mat);
  oh.add(railF, railB, sideL, sideR, rib);
  oh.position.set(0, 0.62, -0.35);
  oh.rotation.x = -0.35;
  g.add(oh);

  return g;
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
