// What the light ship made while it was away (GDD 5.7.5).
//
// A million years on the ship is back in its yard, finished. The corner of
// its block it was never given is there now, in round cells, and on the top
// of its bow, where a small glass blister was, there is a dome: the command
// bridge, with a helm, the pilot's seat and one for each of the three
// captains. From the finished corner a double strand of small cells runs the
// length of the ship, over the block and along the spine, turning on itself
// the whole way, down into the crown of the dome: what it made at one end,
// joined to where it is steered from at the other.
//
// Seen from the gallery, never walked here (world/launch.js walks the same
// bridge at its own size). A few instanced meshes and a few merged ones, one
// uniform (the hangar's clock). Built the first time it is wanted, in the
// hangar's root frame (world/lightvessel.js): +z is the light ship's bow, the
// gallery is off to +x.

import * as THREE from 'three';
import { tint, box, cyl, mergedMesh } from './capital.js';

const STRAND_N = 132, STRAND_R = 13, STRAND_TURNS = 8.5;
// The command bridge under the dome, in its own frame (+z the ship's bow):
// the floor's height and middle, and from that middle [x, z] for the helm, the
// pilot's seat, the captains' three (and their desks), and where each captain
// stands at theirs. Vask, Marrow, Lux: CAPTAINS order.
const ARC = [0.95, 0, -0.95];
export const BRIDGE = {
  y: 8.9, z: 12, floor: 17.6, dome: 19,
  helm: [0, 6.2],
  pilot: [0, 2.2],
  seats: ARC.map((a) => [Math.sin(a) * 8.5, -Math.cos(a) * 8.5 + 1.0]),
  desks: ARC.map((a) => [Math.sin(a) * 8.5, -Math.cos(a) * 8.5 + 4.4]),
  stands: ARC.map((a) => [Math.sin(a) * 8.5, -Math.cos(a) * 8.5 + 2.9]),
};

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
    float rule = max(smoothstep(0.465, 0.493, abs(fract(lon) - 0.5)), smoothstep(0.47, 0.494, abs(fract(lat) - 0.5)));
    vec3 irid = 0.5 + 0.5 * cos(6.2832 * (facing * 1.3 + uTime * 0.02 + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(0.65, 0.9, 1.0), irid, 0.5) * (0.35 + 1.1 * rim) + vec3(0.7, 1.0, 1.0) * rule * 0.9;
    // from inside (the far side of the glass is its back), nearly clear: the ribs and a breath of the film
    float a = gl_FrontFacing ? 0.16 + 0.55 * rim + 0.5 * rule : 0.03 + 0.12 * rim + 0.4 * rule;
    gl_FragColor = vec4(col * (gl_FrontFacing ? 1.0 : 0.7), a);
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
// hangar: world/lightvessel.js's (root, uniforms, cornerAt)
export function createMade(hangar) {
  const root = new THREE.Group();
  root.visible = false;
  hangar.root.add(root);
  const time = hangar.uniforms.uTime;
  const dummy = new THREE.Object3D();

  // --- the bridge, on the top of the bow where the blister was ---
  const craft = new THREE.Group();
  craft.position.set(hangar.helm.x, hangar.bowTop - BRIDGE.y, hangar.helm.z - BRIDGE.z);
  root.add(craft);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(19.5, 1.5, 8, 48).rotateX(Math.PI / 2).translate(0, 8.6, 12), new THREE.MeshLambertMaterial({ color: 0x39424e, emissive: 0x1c222b }));
  craft.add(collar);
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
  // under the glass: the command bridge. The helm forward with the one round
  // cell turning high over it, the pilot's seat behind it and the three
  // captains' in an arc behind that.
  const lit = [], glow = [];
  const STEEL = 0x39424e, DARK = 0x151a21;
  const BY = BRIDGE.y, BZ = BRIDGE.z; // the bridge's floor, and its middle
  {
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 3), cellMat(roundU), 1);
    dummy.position.set(BRIDGE.helm[0], BY + 13.5, BZ + BRIDGE.helm[1]); // high over the helm, under the crown of the dome
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(3.6);
    dummy.updateMatrix();
    m.setMatrixAt(0, dummy.matrix);
    craft.add(seeded(m, new Float32Array([0.31]), new Float32Array(1)));
  }
  lit.push(tint(cyl(17.6, 17.6, 0.5, 0, BY - 0.25, BZ, 40), DARK));
  glow.push(tint(new THREE.TorusGeometry(17.2, 0.22, 6, 56).rotateX(Math.PI / 2).translate(0, BY + 0.1, BZ), 0x9fe8ff, 1.6));
  // the helm, forward: a console at waist height for whoever is in the
  // pilot's seat behind it; the captains' three in an arc behind that, each
  // with a desk of light. (The same layout is walked at its own size on the
  // way out, in world/launch.js: BRIDGE.)
  const [hx, hz] = BRIDGE.helm;
  lit.push(tint(cyl(0.8, 1.3, 1.5, hx, BY + 0.75, BZ + hz, 14), STEEL));
  lit.push(tint(cyl(2.0, 0.9, 0.4, hx, BY + 1.7, BZ + hz, 20), DARK));
  glow.push(tint(new THREE.TorusGeometry(1.95, 0.12, 6, 32).rotateX(Math.PI / 2).translate(hx, BY + 1.95, BZ + hz), 0xffe2a0, 2.0));
  glow.push(tint(cyl(1.6, 1.6, 0.08, hx, BY + 1.95, BZ + hz, 24), 0x7fd8ff, 1.3));
  // (sized for the people who sit in them: a person here is about 3.4 tall)
  const seat = (x, z, gold) => {
    lit.push(tint(box(1.9, 0.95, 1.9, x, BY + 0.48, z), STEEL));
    lit.push(tint(box(1.9, 2.6, 0.36, x, BY + 1.95, z - 0.95), DARK));
    lit.push(tint(box(0.3, 0.7, 1.6, x - 1.0, BY + 1.2, z), DARK), tint(box(0.3, 0.7, 1.6, x + 1.0, BY + 1.2, z), DARK));
    glow.push(tint(box(1.6, 0.16, 0.16, x, BY + 3.28, z - 0.95), gold ? 0xffe2a0 : 0x9fe8ff, 1.9));
    glow.push(tint(box(1.5, 0.06, 1.5, x, BY + 0.98, z), gold ? 0xffd890 : 0x7fd8ff, 0.9));
  };
  seat(BRIDGE.pilot[0], BZ + BRIDGE.pilot[1], true);
  for (const [x, z] of BRIDGE.seats) seat(x, BZ + z, false);
  for (const [x, z] of BRIDGE.desks) {
    lit.push(tint(box(0.4, 1.6, 0.4, x, BY + 0.8, BZ + z), DARK));
    glow.push(tint(box(2.2, 0.1, 0.8, x, BY + 1.7, BZ + z), 0x8affc8, 1.2));
  }

  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  craft.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1c222b })));
  craft.add(mergedMesh(flat(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  // --- the strands: from the finished corner to the dome ---
  craft.updateMatrix();
  const domeTop = new THREE.Vector3(0, 27, 12).applyMatrix4(craft.matrix);
  const c = hangar.cornerAt;
  // up out of the corner, forward over the top of the block (clear of it), along
  // the spine, and down into the dome's crown
  const curve = new THREE.CatmullRomCurve3([
    c.clone(),
    new THREE.Vector3(c.x + 60, c.y + 95, c.z + 70),
    new THREE.Vector3(-35, 215, -200),
    new THREE.Vector3(45, 200, -50),
    new THREE.Vector3(-25, 175, 100),
    new THREE.Vector3(25, 165, 230),
    new THREE.Vector3(domeTop.x, domeTop.y + 55, domeTop.z - 30),
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

  // the middle of the bridge, in the root's frame
  const at = new THREE.Vector3(0, BRIDGE.y, BRIDGE.z).applyMatrix4(craft.matrix);
  return {
    show(on) {
      root.visible = on;
      hangar.blister.visible = !on; // (the dome stands where the blister was)
    },
    tick() {},
    // for whoever shows it (world/lightcity.js, world/launch.js), in the hangar's root frame
    at, corner: c, curve, root, craft, dome,
    state: () => ({ shown: root.visible, cubes: STRAND_N * 2, at: at.toArray().map(Math.round), corner: c.toArray().map(Math.round) }),
  };
}
