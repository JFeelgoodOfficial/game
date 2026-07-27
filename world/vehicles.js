// The four governor-quest vehicles (src/inventory.js ITEMS): procedural
// meshes sized to the astronaut (~1.9 u tall), built once in initWalk and
// parented to the astronaut's travel frame (+Z = direction of motion) or its
// torso, per vehicle. Visibility is driven by src/astronaut.js update() from
// the walker's vehicle/mode state — this module is geometry only.
//
// Same idiom as the parked ship / station props: Box/Cylinder/Capsule
// primitives, MeshStandardMaterial, one emissive accent that blooms at night.
// Each build* returns { group, parent } where parent is 'group' (travel
// frame, sits under the feet) or 'body' (rides the torso, leans with it).

import * as THREE from 'three';

const HULL = 0x2b2e38;
const HULL_LIGHT = 0x555b68;
const ACCENT = 0xd4408f;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.55, metalness: opts.metalness ?? 0.35,
    ...(opts.emissive !== undefined
      ? { emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity ?? 0.8 }
      : {}),
  });
}

function add(group, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

// --- Redline Runner: a low fat-tired dust bike. Nose along +Z. -------------
export function buildMotorcycle(accent = ACCENT) {
  const g = new THREE.Group();
  const hull = mat(HULL);
  const bright = mat(HULL_LIGHT, { metalness: 0.7, roughness: 0.35 });
  const glow = mat(0x1a0a12, { emissive: accent, emissiveIntensity: 1.2 });
  const tire = mat(0x14161a, { roughness: 0.95, metalness: 0.05 });

  // wheels: fat tori, axles across X
  const wheel = new THREE.TorusGeometry(0.34, 0.13, 8, 16);
  add(g, wheel, tire, 0, 0.34, 0.78, 0, Math.PI / 2, 0);
  add(g, wheel, tire, 0, 0.34, -0.62, 0, Math.PI / 2, 0);
  add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), bright, 0, 0.34, 0.78, 0, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), bright, 0, 0.34, -0.62, 0, 0, Math.PI / 2);
  // frame spine + tank + saddle
  add(g, new THREE.BoxGeometry(0.2, 0.16, 1.3), hull, 0, 0.55, 0.05, -0.06);
  add(g, new THREE.BoxGeometry(0.26, 0.22, 0.5), hull, 0, 0.68, 0.22);
  add(g, new THREE.BoxGeometry(0.3, 0.08, 0.42), tire, 0, 0.74, -0.28); // saddle
  // fork + bars
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8), bright, 0.09, 0.62, 0.72, 0.5);
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8), bright, -0.09, 0.62, 0.72, 0.5);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.56, 8), bright, 0, 0.94, 0.55, 0, 0, Math.PI / 2);
  // headlight + tail strip
  add(g, new THREE.SphereGeometry(0.07, 10, 8), glow, 0, 0.8, 0.52);
  add(g, new THREE.BoxGeometry(0.24, 0.05, 0.05), glow, 0, 0.7, -0.5);
  // engine block fins
  add(g, new THREE.BoxGeometry(0.34, 0.26, 0.34), bright, 0, 0.42, 0.02);
  return { group: g, parent: 'group' };
}

// --- Reach Expedition Pack: a twin-thruster backpack. Rides the torso. -----
export function buildJetpack(accent = ACCENT) {
  const g = new THREE.Group();
  const hull = mat(HULL);
  const bright = mat(HULL_LIGHT, { metalness: 0.7, roughness: 0.35 });
  const glow = mat(0x1a0a12, { emissive: accent, emissiveIntensity: 1.4 });

  // pack body against the back (astronaut back is -Z of the body frame)
  add(g, new THREE.BoxGeometry(0.42, 0.5, 0.16), hull, 0, 0.08, -0.05);
  // twin thruster cans
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.09, 0.11, 0.46, 10), bright, s * 0.14, -0.02, -0.13);
    add(g, new THREE.CylinderGeometry(0.07, 0.1, 0.08, 10), glow, s * 0.14, -0.28, -0.13);
  }
  // shoulder straps hint
  add(g, new THREE.BoxGeometry(0.06, 0.34, 0.24), hull, 0.16, 0.16, 0.06);
  add(g, new THREE.BoxGeometry(0.06, 0.34, 0.24), hull, -0.16, 0.16, 0.06);
  // exposed by walk.js: the exhaust glow scales with thrust
  g.userData.exhaust = g.children.filter((m) => m.material === glow);
  return { group: g, parent: 'body' };
}

// --- Saddle Kite: a hang glider wing overhead. Nose along +Z. --------------
export function buildHangglider(accent = ACCENT) {
  const g = new THREE.Group();
  const bright = mat(HULL_LIGHT, { metalness: 0.6, roughness: 0.4 });
  const sail = new THREE.MeshStandardMaterial({
    color: 0xe8ecf4, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide,
    emissive: accent, emissiveIntensity: 0.12,
  });

  // Two swept sail triangles meeting at the keel.
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.1); // nose (z forward mapped to shape +y)
    shape.lineTo(s * 2.6, -1.0); // wingtip
    shape.lineTo(0, -0.7); // tail on the keel
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // lay flat: shape y -> world +Z
    add(g, geo, sail, 0, 2.05, 0);
  }
  // keel + crossbar + kingpost
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), bright, 0, 2.05, 0.15, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(0.025, 0.025, 4.6, 8), bright, 0, 2.02, -0.2, 0, 0, Math.PI / 2);
  // control triangle down to the pilot
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.02, 0.02, 1.15, 6), bright, s * 0.3, 1.5, 0.12, 0, 0, s * 0.5);
  }
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), bright, 0, 1.0, 0.12, 0, 0, Math.PI / 2);
  return { group: g, parent: 'group' };
}

// --- Meridian Ultralight: a tiny open-frame plane. Nose along +Z. ----------
export function buildPlane(accent = ACCENT) {
  const g = new THREE.Group();
  const hull = mat(HULL);
  const bright = mat(HULL_LIGHT, { metalness: 0.7, roughness: 0.35 });
  const glow = mat(0x1a0a12, { emissive: accent, emissiveIntensity: 1.0 });
  const sail = new THREE.MeshStandardMaterial({
    color: 0xdfe4ee, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide,
  });

  // fuselage pod + tail boom
  add(g, new THREE.CapsuleGeometry(0.24, 0.9, 4, 10), hull, 0, 0.72, 0.25, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), bright, 0, 0.85, -1.0, Math.PI / 2);
  // high wing
  add(g, new THREE.BoxGeometry(5.4, 0.06, 0.9), sail, 0, 1.5, 0.35);
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6), bright, s * 1.1, 1.1, 0.35, 0, 0, s * 1.15);
  }
  // tail plane + fin
  add(g, new THREE.BoxGeometry(1.6, 0.05, 0.45), sail, 0, 0.9, -1.7);
  add(g, new THREE.BoxGeometry(0.05, 0.7, 0.5), sail, 0, 1.2, -1.72);
  // prop disc (spun in update via userData) + nose glow
  const prop = add(g, new THREE.BoxGeometry(0.06, 1.15, 0.04), bright, 0, 0.72, 0.98);
  add(g, new THREE.SphereGeometry(0.09, 10, 8), glow, 0, 0.72, 1.02);
  // landing skids
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), bright, s * 0.3, 0.3, 0.2, 0.25);
    add(g, new THREE.BoxGeometry(0.08, 0.05, 0.9), hull, s * 0.34, 0.04, 0.3);
  }
  g.userData.prop = prop;
  return { group: g, parent: 'group' };
}

export function buildVehicles(accent = ACCENT) {
  return {
    motorcycle: buildMotorcycle(accent),
    jetpack: buildJetpack(accent),
    hangglider: buildHangglider(accent),
    plane: buildPlane(accent),
  };
}

export function disposeVehicles(vehicles) {
  for (const key of Object.keys(vehicles)) {
    vehicles[key].group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
