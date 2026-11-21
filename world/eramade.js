// What the light ship made while it was away (GDD 5.7.5).
//
// A million years on the ship is back in its yard, and it is not alone there.
// Off its forward quarter, close under the gallery's rail, floats a second
// vessel that nobody built: a rounded hull of the same glass film as the
// hangar's blades, and on its foredeck a dome, which is the command bridge:
// a helm, the pilot's seat and one for each of the three captains. Aft, a
// lamp on a tower sweeps the yard. From the corner the ship finished
// itself with, a double strand of small cells runs out to it, turning on
// itself the whole way: the ship has not let go of what it made.
//
// Seen from the gallery, never walked. Three instanced meshes and a handful
// of merged ones, one uniform (the hangar's clock). Built the first time it
// is wanted, in the hangar's root frame (world/lightvessel.js): +z is the
// light ship's bow, the gallery is off to +x.

import * as THREE from 'three';
import { tint, box, cyl, mergedMesh } from './capital.js';

// where it floats, and how it is turned: broadside on to the gallery, bow to the left of it
const AT = new THREE.Vector3(232, -50, 128);
const YAW = 1.48;
const STRAND_N = 132, STRAND_R = 13, STRAND_TURNS = 8.5;

const WORLD_VERT = /* glsl */ `
  varying vec3 vL;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// the hull: a film of every colour over polished metal, with seams of light
const HULL_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vL;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float facing = max(dot(n, v), 0.0);
    float film = facing * 1.5 + vL.y * 0.035 + vL.z * 0.012 + uTime * 0.03;
    vec3 irid = 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
    // what a mirror would show: pale above, dark under
    vec3 r = reflect(-v, n);
    vec3 env = mix(vec3(0.10, 0.13, 0.22), vec3(0.80, 0.90, 1.0), smoothstep(-0.35, 0.6, r.y));
    vec3 col = mix(env * 0.7, irid, 0.6) * (0.36 + 0.8 * pow(1.0 - facing, 1.6));
    // seams: long lines of light down the hull, and the strakes swept round its bow
    float seam = smoothstep(0.86, 0.97, abs(fract(vL.y * 0.115 + 0.08 * sin(vL.z * 0.05)) - 0.5) * 2.0);
    col += vec3(0.75, 0.95, 1.0) * seam * 0.9;
    col += vec3(1.0) * pow(max(dot(r, normalize(vec3(0.4, 0.8, 0.3))), 0.0), 24.0) * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }
`;
// the dome: nearly clear, ruled like a globe, bright at the rim
const DOME_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vL;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float facing = abs(dot(normalize(vN), v));
    float rim = pow(1.0 - facing, 2.2);
    vec3 d = normalize(vL);
    float lon = atan(d.z, d.x) / 6.2832 * 14.0, lat = asin(clamp(d.y, -1.0, 1.0)) / 1.5708 * 5.0;
    float rule = max(smoothstep(0.42, 0.49, abs(fract(lon) - 0.5)), smoothstep(0.44, 0.49, abs(fract(lat) - 0.5)));
    vec3 irid = 0.5 + 0.5 * cos(6.2832 * (facing * 1.3 + uTime * 0.02 + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(0.65, 0.9, 1.0), irid, 0.5) * (0.35 + 1.1 * rim) + vec3(0.7, 1.0, 1.0) * rule * 0.9;
    gl_FragColor = vec4(col, 0.16 + 0.55 * rim + 0.5 * rule);
  }
`;
// a small cell: the round one over the helm, and the cubes of the strands
const CELL_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aAlong;
  varying vec3 vL;
  varying vec3 vW;
  varying vec3 vN;
  varying float vSeed;
  varying float vAlong;
  void main() {
    vL = position;
    vSeed = aSeed;
    vAlong = aAlong;
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const CELL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uCube; // 1: a framed cube of the strands. 0: a round cell
  varying vec3 vL;
  varying vec3 vW;
  varying vec3 vN;
  varying float vSeed;
  varying float vAlong;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float facing = max(dot(normalize(vN), v), 0.0);
    // colour runs out along the strands from the ship to what it made
    float h = vSeed * (1.0 - 0.75 * uCube) + uCube * (vAlong * 2.6 - uTime * 0.16);
    vec3 a = 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
    float pulse = 0.78 + 0.22 * sin(uTime * 1.7 + vSeed * 40.0 - vAlong * 30.0 * uCube);
    vec3 col = a * (0.6 + 0.7 * facing) * pulse;
    if (uCube > 0.5) {
      // glass with a core of light, held in a dark frame
      vec3 q = abs(vL);
      float m = max(q.x, max(q.y, q.z));
      float e = q.x + q.y + q.z - m - min(q.x, min(q.y, q.z)); // the middle one: near 0.5 along an edge
      float frame = smoothstep(0.40, 0.46, e);
      float core = 1.0 - smoothstep(0.0, 0.42, e);
      col = col * (0.6 + 0.75 * core) + vec3(1.0, 0.98, 0.92) * core * core * core * 0.22;
      col = mix(col, a * 0.10 + vec3(0.03), frame);
    } else {
      float f = sin(vL.x * 6.0 + uTime * 0.4 + vSeed * 20.0) + sin(vL.y * 7.5 - uTime * 0.31) + sin(vL.z * 5.0 + uTime * 0.23);
      col = (0.5 + 0.5 * cos(6.2832 * (vSeed + f * 0.11 + vec3(0.0, 0.33, 0.67)))) * (0.55 + 0.6 * facing);
    }
    col += vec3(1.0, 0.97, 0.9) * pow(1.0 - facing, 2.5) * mix(0.8, 0.25, uCube);
    gl_FragColor = vec4(col * 1.2, 1.0);
  }
`;
// the lamp's beam: a cone of light, thin at the lamp and gone by its far end
const BEAM_VERT = /* glsl */ `
  varying float vAlong;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vAlong = position.z;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const BEAM_FRAG = /* glsl */ `
  varying float vAlong;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    float side = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
    float a = (1.0 - vAlong) * (1.0 - vAlong) * (0.2 + 0.8 * side * side);
    gl_FragColor = vec4(vec3(0.78, 0.93, 1.0) * a, 1.0);
  }
`;

// hangar: world/lightvessel.js's (root, uniforms, cornerAt)
export function createMade(hangar) {
  const root = new THREE.Group();
  root.visible = false;
  hangar.root.add(root);
  const time = hangar.uniforms.uTime;
  const dummy = new THREE.Object3D();

  // --- the vessel ---
  const craft = new THREE.Group();
  craft.position.copy(AT);
  craft.rotation.y = YAW;
  root.add(craft);
  const hullMat = new THREE.ShaderMaterial({ uniforms: { uTime: time }, vertexShader: WORLD_VERT, fragmentShader: HULL_FRAG, fog: false });
  // the hull: full at the bow, drawn out aft, flat under the deck
  const hullGeo = new THREE.SphereGeometry(1, 48, 28);
  {
    const p = hullGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const taper = z < 0 ? 1.0 - 0.38 * z * z : 1.0; // narrower toward the stern (-z)
      x *= 25 * taper;
      y = (y > 0.34 ? 0.34 + (y - 0.34) * 0.12 : y) * 21 * (z < 0 ? 1.0 - 0.25 * z * z : 1.0);
      z *= z < 0 ? 62 : 46;
      // (the strakes below are rings of the bow's own shape: aft of amidships they lie inside the hull)
      p.setXYZ(i, x, y, z);
    }
    hullGeo.computeVertexNormals();
  }
  craft.add(new THREE.Mesh(hullGeo, hullMat));
  // two strakes swept round the bow, and a collar where the dome sits
  const strakes = [];
  for (const [y, k] of [[-3, 1.05], [-11, 0.9]]) {
    strakes.push(new THREE.TorusGeometry(25 * k, 1.7, 10, 64).rotateX(Math.PI / 2).scale(1, 1, 46 / 25).translate(0, y, 0));
  }
  strakes.push(new THREE.TorusGeometry(19.5, 1.5, 8, 48).rotateX(Math.PI / 2).translate(0, 8.6, 12));
  craft.add(mergedMesh(strakes, hullMat));

  // the dome on the foredeck, and what is under it
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(19, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: { uTime: time }, vertexShader: WORLD_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  dome.position.set(0, 8.6, 12);
  dome.renderOrder = 3;
  craft.add(dome);
  const roundU = { uTime: time, uCube: { value: 0 } };
  const cellMat = (u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: CELL_VERT, fragmentShader: CELL_FRAG, fog: false });
  const seeded = (mesh, seeds, along) => {
    mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.geometry.setAttribute('aAlong', new THREE.InstancedBufferAttribute(along, 1));
    mesh.frustumCulled = false;
    return mesh;
  };
  // under the glass: the command bridge. A helm in the middle with the one
  // round cell turning over it, the pilot's seat ahead of it and the three
  // captains' in an arc behind. Larger than life, to be read from the gallery.
  const lit = [], glow = [];
  const STEEL = 0x39424e, DARK = 0x151a21;
  const BY = 8.9, BZ = 12; // the bridge's floor, and its middle
  {
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 3), cellMat(roundU), 1);
    dummy.position.set(0, BY + 9.2, BZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(5.4);
    dummy.updateMatrix();
    m.setMatrixAt(0, dummy.matrix);
    craft.add(seeded(m, new Float32Array([0.31]), new Float32Array(1)));
  }
  lit.push(tint(cyl(17.6, 17.6, 0.5, 0, BY - 0.25, BZ, 40), DARK));
  glow.push(tint(new THREE.TorusGeometry(17.2, 0.22, 6, 56).rotateX(Math.PI / 2).translate(0, BY + 0.1, BZ), 0x9fe8ff, 1.6));
  // the helm: a pedestal, a ring of light round its head, a wheel of it on top
  lit.push(tint(cyl(1.5, 2.6, 4.2, 0, BY + 2.1, BZ, 14), STEEL));
  lit.push(tint(cyl(3.4, 1.6, 0.7, 0, BY + 4.5, BZ, 20), DARK));
  glow.push(tint(new THREE.TorusGeometry(3.3, 0.2, 6, 32).rotateX(Math.PI / 2).translate(0, BY + 4.95, BZ), 0xffe2a0, 2.0));
  glow.push(tint(cyl(2.6, 2.6, 0.12, 0, BY + 4.95, BZ, 24), 0x7fd8ff, 1.3));
  // four seats: the pilot's forward of the helm, the captains' behind it
  const seat = (x, z, gold) => {
    lit.push(tint(box(3.0, 1.5, 3.0, x, BY + 0.75, z), STEEL));
    lit.push(tint(box(3.0, 4.4, 0.6, x, BY + 3.0, z - 1.5), DARK));
    lit.push(tint(box(0.5, 1.1, 2.6, x - 1.6, BY + 2.0, z), DARK), tint(box(0.5, 1.1, 2.6, x + 1.6, BY + 2.0, z), DARK));
    glow.push(tint(box(2.6, 0.24, 0.24, x, BY + 5.3, z - 1.5), gold ? 0xffe2a0 : 0x9fe8ff, 1.9));
    glow.push(tint(box(2.4, 0.1, 2.4, x, BY + 1.56, z), gold ? 0xffd890 : 0x7fd8ff, 0.9));
  };
  seat(0, BZ + 8.2, true);
  for (const a of [-0.95, 0, 0.95]) seat(Math.sin(a) * 9.5, BZ - Math.cos(a) * 9.5 + 1.5, false);
  // ...and a desk of light in front of each captain's
  for (const a of [-0.95, 0, 0.95]) glow.push(tint(box(3.2, 0.14, 1.0, Math.sin(a) * 9.5, BY + 2.9, BZ - Math.cos(a) * 9.5 + 4.6), 0x8affc8, 1.2));

  // the lamp, aft: a tower with a gallery round its head
  const TY = 4.5, TZ = -34; // its foot on the after deck
  lit.push(tint(cyl(6.2, 7.4, 4, 0, TY + 2, TZ, 20), DARK));
  lit.push(tint(cyl(3.6, 5.4, 30, 0, TY + 19, TZ, 20), STEEL));
  lit.push(tint(cyl(6.4, 4.2, 2, 0, TY + 35, TZ, 20), DARK));
  lit.push(tint(new THREE.TorusGeometry(6.6, 0.28, 6, 28).rotateX(Math.PI / 2).translate(0, TY + 38.2, TZ), STEEL));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lit.push(tint(cyl(0.16, 0.16, 2.4, Math.cos(a) * 6.6, TY + 37.1, TZ + Math.sin(a) * 6.6, 5), STEEL));
  }
  for (let i = 0; i < 4; i++) glow.push(tint(cyl(4.9 - i * 0.42, 4.95 - i * 0.42, 0.5, 0, TY + 9 + i * 7, TZ, 20), 0x9fe8ff, 1.5));
  glow.push(tint(cyl(3.3, 3.3, 5.6, 0, TY + 39.2, TZ, 16), 0xf4fbff, 2.6)); // the lamp room
  lit.push(tint(new THREE.ConeGeometry(4.6, 4.2, 16).translate(0, TY + 44.2, TZ), DARK));
  glow.push(tint(new THREE.SphereGeometry(0.7, 8, 6).translate(0, TY + 46.8, TZ), 0xffe2a0, 2.0));
  // lights along the deck's edge
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    glow.push(tint(new THREE.SphereGeometry(0.55, 6, 5).translate(Math.cos(a) * 22.5, 5.6, Math.sin(a) * 40 - 4), i % 3 ? 0x9fe8ff : 0xffe2a0, 1.7));
  }
  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  craft.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1c222b })));
  craft.add(mergedMesh(flat(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  // ...and its beam: one each way, turning
  const lamp = new THREE.Group();
  lamp.position.set(0, TY + 39.2, TZ);
  craft.add(lamp);
  const beamGeo = new THREE.CylinderGeometry(1, 0.05, 1, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5); // apex at the lamp, opening down +z
  const beamMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const s of [1, -1]) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.scale.set(46, 46, 620 * s);
    b.frustumCulled = false;
    b.renderOrder = 6;
    lamp.add(b);
  }

  // --- the strands: from the finished corner to the dome ---
  craft.updateMatrix();
  const domeTop = new THREE.Vector3(0, 27, 12).applyMatrix4(craft.matrix);
  const c = hangar.cornerAt;
  const curve = new THREE.CatmullRomCurve3([
    c.clone(),
    new THREE.Vector3(c.x + 95, c.y + 34, c.z + 70),
    new THREE.Vector3(176, 58, -215),
    new THREE.Vector3(128, 4, -92),
    new THREE.Vector3(214, 34, 6),
    new THREE.Vector3(domeTop.x - 6, domeTop.y + 40, domeTop.z - 52),
    domeTop,
  ], false, 'centripetal');
  const frames = curve.computeFrenetFrames(STRAND_N - 1, false);
  const cubeU = { uTime: time, uCube: { value: 1 } };
  const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cellMat(cubeU), STRAND_N * 2);
  const rungN = Math.floor((STRAND_N - 1) / 3) + 1;
  const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.0), transparent: true, opacity: 0.55, fog: false }), rungN);
  const seeds = new Float32Array(STRAND_N * 2), along = new Float32Array(STRAND_N * 2);
  const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), basis = new THREE.Matrix4();
  for (let i = 0; i < STRAND_N; i++) {
    const s = i / (STRAND_N - 1);
    curve.getPointAt(s, P);
    const a = s * STRAND_TURNS * Math.PI * 2;
    // drawn in to a point at each end, where it leaves the one and meets the other
    const rad = STRAND_R * Math.min(1, Math.sin(s * Math.PI) * 3.2 + 0.12);
    const N = frames.normals[i], Bn = frames.binormals[i], T = frames.tangents[i];
    A.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(Bn, Math.sin(a)); // out from the axis
    B.crossVectors(T, A);
    basis.makeBasis(A, B, T);
    for (const side of [0, 1]) {
      const k = i * 2 + side;
      dummy.position.copy(P).addScaledVector(A, side ? -rad : rad);
      dummy.quaternion.setFromRotationMatrix(basis);
      dummy.scale.setScalar(4.7 + 1.2 * ((k * 0.618) % 1));
      dummy.updateMatrix();
      cubes.setMatrixAt(k, dummy.matrix);
      seeds[k] = (k * 0.7548) % 1;
      along[k] = s;
    }
    if (i % 3 === 0) {
      dummy.position.copy(P);
      dummy.quaternion.setFromRotationMatrix(basis);
      dummy.scale.set(rad * 2, 0.5, 0.5);
      dummy.updateMatrix();
      rungs.setMatrixAt(i / 3, dummy.matrix);
    }
  }
  seeded(cubes, seeds, along);
  rungs.frustumCulled = false;
  root.add(cubes, rungs);

  return {
    show(on) {
      root.visible = on;
    },
    tick(t) {
      if (!root.visible) return;
      lamp.rotation.y = t * 0.22;
      craft.position.y = AT.y + Math.sin(t * 0.35) * 1.6; // it rides, a little
    },
    // for whoever shows it (world/lightcity.js), in the hangar's root frame
    at: AT, corner: c, curve,
    state: () => ({ shown: root.visible, cubes: STRAND_N * 2, at: AT.toArray(), corner: c.toArray().map(Math.round) }),
  };
}
