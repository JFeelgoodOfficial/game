/**
 * actuality-sky.js
 *
 * The sky, the light, and the image-based lighting for the story worlds. Written
 * for world/actuality.js and now shared with world/shadowreach.js, which brings
 * its own presets in through `opts.presets` and drives them as a continuous arc
 * along its path rather than as per-zone cuts. Nothing here is Actuality-specific
 * beyond the built-in preset table and the file's name.
 *
 * What this replaces: nine two-stop gradients painted on MeshBasicMaterial
 * spheres. Those don't light anything — they are wallpaper behind the geometry,
 * which is why every surface in Actuality reads as flat coloured plastic no
 * matter what materials you put on it.
 *
 * What it does instead, and the order matters:
 *
 *  1. **Sky** — the Preetham analytic daylight model (three/addons/objects/Sky),
 *     driven by turbidity/rayleigh/mie and a sun elevation. A real blue sky is
 *     not a gradient: it is bright and desaturated near the horizon, deep at the
 *     zenith, and warm around the sun, and it changes character with sun height.
 *     You cannot fake that with two colour stops.
 *  2. **Clouds** — a raymarched slab above the world, sampling a 3D noise volume
 *     baked once at startup (the same trick nebula.js uses for its cubemap:
 *     pay for the noise a single time, then it's a texture fetch). Coverage,
 *     altitude and drift are per-preset, so "a perfect blue sky with clouds here
 *     and there" and "darkened, moody, some stars and cloud" are the same system
 *     at two settings.
 *  3. **Stars** — only built when a preset asks for them.
 *  4. **IBL** — the finished sky is rendered through PMREMGenerator into
 *     `scene.environment`. THIS is the step that makes everything else look
 *     real: every PBR surface then gets its ambient and specular response from
 *     the actual sky above it instead of a flat AmbientLight. It costs one bake
 *     per preset change, and every preset change in this world happens during a
 *     fade-to-black, so the player never sees the hitch.
 *  5. **Sun** — a DirectionalLight matched to the sky's own sun, with a shadow
 *     camera sized to the active zone rather than to a planet.
 *  6. **Fog** — FogExp2 tinted to the preset's horizon, so distance reads.
 *
 * Frames: the sky mesh, the cloud slab and the star dome are children of the
 * caller's `anchor` (local +Y is up, local -Z faces the world). The Sky shader
 * wants WORLD-space `up` and `sunPosition`, so both are pulled off the anchor's
 * matrixWorld each frame — the planet is spin-frozen on this world, but origin
 * rebasing still moves everything, so it is read live rather than cached.
 *
 * Zero per-frame allocation: every vector and matrix below is module scope.
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import cloudsFrag from './shaders/actualityClouds.frag?raw';

/* ----------------------------------------------------------------------
 * Presets. Each is a complete description of "what it is like outside".
 * ------------------------------------------------------------------- */
// `exposure` is the camera stop for the place, and it is authored per preset
// for the same reason a photographer changes theirs: a single value calibrated
// for noon renders dusk as mud and night as a black screen. This is the eye
// adapting as you step from a sunlit terrace into a dark room.
export const SKY_PRESETS = {
  // The headline look: a genuinely blue sky with clouds here and there.
  // Sun kept low-ish and turbidity low — clean deep blue overhead, warm light
  // raking across the terrace rather than flat noon glare.
  clearBlue: {
    turbidity: 2.0, rayleigh: 1.35, mie: 0.004, mieG: 0.82,
    elevation: 34, azimuth: 145,
    sunColor: 0xfff2dc, sunIntensity: 3.4,
    cloud: { cover: 0.34, altitude: 1150, thickness: 420, drift: 0.9, tint: 0xffffff, ambient: 2.6 },
    fog: { color: 0xbfd4e8, density: 0.0016 },
    exposure: 0.32,
    // Outdoors the sun is several times the sky's contribution; matching them
    // 1:1 flattens every shadow into grey. This ratio is what gives the terrace
    // its direction of light.
    envIntensity: 0.45,
  },
  // Low warm sun, more haze — autumn afternoon.
  goldenLow: {
    turbidity: 4.2, rayleigh: 2.4, mie: 0.006, mieG: 0.84,
    elevation: 11, azimuth: 200,
    sunColor: 0xffc98a, sunIntensity: 2.9,
    cloud: { cover: 0.42, altitude: 1000, thickness: 440, drift: 0.7, tint: 0xffd9b0, ambient: 1.9 },
    fog: { color: 0xd8b489, density: 0.0034 },
    exposure: 0.40,
    envIntensity: 0.5,
  },
  dusk: {
    turbidity: 6.5, rayleigh: 3.0, mie: 0.007, mieG: 0.86,
    elevation: 1.6, azimuth: 250,
    sunColor: 0xff9a56, sunIntensity: 2.4,
    cloud: { cover: 0.5, altitude: 1050, thickness: 460, drift: 0.55, tint: 0xffb27a, ambient: 0.85 },
    fog: { color: 0x8a6a70, density: 0.0042 },
    exposure: 0.62,
    envIntensity: 0.6,
  },
  // The moody one: sun below the horizon, stars out, cloud lit from behind by
  // the moon. Rayleigh stays up so the sky is deep blue rather than black —
  // night that you can still see the shape of.
  nightMoody: {
    turbidity: 8.0, rayleigh: 2.2, mie: 0.004, mieG: 0.80,
    elevation: -7, azimuth: 250,
    sunColor: 0x9fb6e0, sunIntensity: 0.9, // moonlight: cool, weak, but a real key
    cloud: { cover: 0.62, altitude: 1100, thickness: 480, drift: 0.4, tint: 0x8fa4c8, ambient: 0.16 },
    fog: { color: 0x1a2438, density: 0.0060 },
    exposure: 0.95,
    stars: 0.9,
    envIntensity: 0.8,
  },
  // Interiors: no sky mesh at all, just a small neutral probe so PBR materials
  // still have something to reflect. The zone's own lights do the work.
  interior: {
    interior: true,
    ambient: 0x2a2c33,
    fog: { color: 0x14161c, density: 0.012 },
    envIntensity: 0.35,
    exposure: 0.70,
  },
  // Zone 5's void and Zone 9's chamber want nothing at all.
  none: { none: true, envIntensity: 0.0, exposure: 0.85 },
};

const SKY_SCALE = 3000; // inside the isolated-world far plane (4000)

/* ----------------------------------------------------------------------
 * 3D noise volume for the clouds — baked once, reused by every preset.
 * Worley-ish (inverted distance to scattered feature points) layered with
 * value noise, which is what gives clouds billows instead of TV static.
 * ------------------------------------------------------------------- */
function buildNoiseVolume(size = 64) {
  const data = new Uint8Array(size * size * size * 4);
  // Deterministic point sets for three Worley octaves.
  let s = 0x9e3779b9;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const cellSets = [4, 8, 16].map((cells) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < cells * cells * cells; i++) {
      pts[i * 3] = rnd(); pts[i * 3 + 1] = rnd(); pts[i * 3 + 2] = rnd();
    }
    return { cells, pts };
  });

  const worley = (x, y, z, set) => {
    const { cells, pts } = set;
    const fx = x * cells, fy = y * cells, fz = z * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 1e9;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          // wrap so the volume tiles seamlessly in all three axes
          const cx = (ix + dx + cells) % cells;
          const cy = (iy + dy + cells) % cells;
          const cz = (iz + dz + cells) % cells;
          const idx = ((cz * cells + cy) * cells + cx) * 3;
          const px = (ix + dx) + pts[idx];
          const py = (iy + dy) + pts[idx + 1];
          const pz = (iz + dz) + pts[idx + 2];
          const ddx = px - fx, ddy = py - fy, ddz = pz - fz;
          const d = ddx * ddx + ddy * ddy + ddz * ddz;
          if (d < best) best = d;
        }
      }
    }
    return Math.min(1, Math.sqrt(best));
  };

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, w = z / size;
        // Inverted Worley = billows. Three octaves, halving contribution.
        const a = 1 - worley(u, v, w, cellSets[0]);
        const b = 1 - worley(u, v, w, cellSets[1]);
        const c = 1 - worley(u, v, w, cellSets[2]);
        const base = a * 0.625 + b * 0.25 + c * 0.125;
        const detail = b * 0.5 + c * 0.5;
        const i = ((z * size + y) * size + x) * 4;
        data[i] = Math.max(0, Math.min(255, base * 255)) | 0;      // R: shape
        data[i + 1] = Math.max(0, Math.min(255, detail * 255)) | 0; // G: erosion detail
        data[i + 2] = Math.max(0, Math.min(255, c * 255)) | 0;      // B: fine curl
        data[i + 3] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Scratch — module scope, never allocated in a frame.
const _upWorld = new THREE.Vector3();
const _sunLocal = new THREE.Vector3(); // anchor-local: drives the cloud march + the sun light
const _sunWorld = new THREE.Vector3(); // world: drives the Sky shader + the IBL bake
const _q = new THREE.Quaternion();
const _c = new THREE.Color(); // lerp target for blended presets

/**
 * @param anchor   THREE.Group — local +Y up, local -Z toward the world.
 * @param scene    the root scene (fog + environment live there).
 * @param opts     { quality: 'high'|'low' }
 */
export function createActualitySky(anchor, scene, opts = {}) {
  const lowQuality = opts.quality === 'low';
  // A caller can bring its own weather. Shadowreach walks a story arc from a
  // blue morning down through a storm to a starlit void and back up into dawn,
  // which is six presets this world has no use for — so they ride in rather
  // than accumulating in the table above. Same shape, same fields, and they
  // blend against the built-ins freely.
  const PRESETS = opts.presets ? { ...SKY_PRESETS, ...opts.presets } : SKY_PRESETS;
  const geos = [];
  const mats = [];
  const texs = [];

  // --- Sky (Preetham) ---
  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  sky.frustumCulled = false;
  sky.renderOrder = -1002; // paint first; writes no depth
  sky.userData.noShadow = true; // the sky neither casts nor catches shadows
  anchor.add(sky);

  // --- Cloud slab: a big inward-facing dome the raymarch runs inside. ---
  const cloudGeo = new THREE.SphereGeometry(SKY_SCALE * 0.9, 32, 20);
  geos.push(cloudGeo);
  const noiseTex = buildNoiseVolume(lowQuality ? 32 : 64);
  texs.push(noiseTex);
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noiseTex },
      uTime: { value: 0 },
      uCover: { value: 0.34 },
      uAltitude: { value: 260 },
      uThickness: { value: 110 },
      uDrift: { value: 0.9 },
      uTint: { value: new THREE.Color(0xffffff) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff2dc) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSteps: { value: lowQuality ? 12 : 28 },
      uOpacity: { value: 1 },
      uAmbient: { value: 2.6 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        // Direction from the slab centre (the viewer) to this vertex, in the
        // anchor's local frame — the raymarch works entirely in local space.
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: cloudsFrag,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // depthTest MUST stay on. Transparent objects render after all opaque
    // geometry regardless of renderOrder, so a depth-test-free cloud dome
    // paints itself over the entire world — walls, people, everything. The
    // dome sits at 2700 and the Sky writes no depth, so honouring depth costs
    // nothing and correctly puts the clouds behind the scene.
    depthTest: true,
  });
  mats.push(cloudMat);
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.frustumCulled = false;
  clouds.renderOrder = -1000; // over the sky and the stars, under the world
  clouds.userData.noShadow = true;
  anchor.add(clouds);

  // --- Stars: built once, shown only for presets that ask. ---
  const STAR_COUNT = lowQuality ? 900 : 2600;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starPhase = new Float32Array(STAR_COUNT);
  const starSize = new Float32Array(STAR_COUNT);
  {
    let s = 0x2545f491;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = 0; i < STAR_COUNT; i++) {
      // Upper hemisphere only — below the horizon is ground.
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const y = Math.abs(u) * 0.98 + 0.02;
      starPos[i * 3] = Math.cos(th) * r * SKY_SCALE * 0.8;
      starPos[i * 3 + 1] = y * SKY_SCALE * 0.8;
      starPos[i * 3 + 2] = Math.sin(th) * r * SKY_SCALE * 0.8;
      starPhase[i] = rnd() * 6.283;
      starSize[i] = 0.4 + Math.pow(rnd(), 3) * 2.6; // a few bright ones
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  geos.push(starGeo);
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      void main() {
        vTwinkle = 0.7 + 0.3 * sin(uTime * 1.7 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * 1.6;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      varying float vTwinkle;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float f = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * f * vTwinkle, f * uAmount);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true, // same reason as the clouds — stars must not overpaint the world
    blending: THREE.AdditiveBlending,
  });
  mats.push(starMat);
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -1001; // between sky and cloud, so cloud occludes stars
  stars.visible = false;
  stars.userData.noShadow = true;
  anchor.add(stars);

  // --- Sun: the light that actually casts shadows. ---
  const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(lowQuality ? 1024 : 2048, lowQuality ? 1024 : 2048);
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.02;
  const sc = sunLight.shadow.camera;
  sc.near = 1; sc.far = 260;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
  anchor.add(sunLight);
  anchor.add(sunLight.target); // target at the anchor origin

  // A weak sky-coloured bounce so shadowed sides aren't dead. The environment
  // map does most of this job; this just keeps the floor from going black under
  // furniture when the env intensity is low.
  const bounce = new THREE.HemisphereLight(0xbfd4e8, 0x6a5c48, 0.25);
  anchor.add(bounce);

  // --- IBL bake ---
  // The generator needs a renderer, which this module doesn't get until the
  // first frame, so it's built lazily on the first bake.
  let pmrem = null;
  const bakeScene = new THREE.Scene();
  const bakeSky = new Sky();
  bakeSky.scale.setScalar(SKY_SCALE);
  // The Preetham shader draws the solar disc at `vSunE * 19000.0` — a physically
  // sane number for a sky you look at, and a catastrophic one for a diffuse
  // irradiance convolution: that one tiny, colossally bright texel dominates the
  // whole environment and blows the scene out. It also double-counts, because
  // the sun is already a DirectionalLight above. So the BAKE sky (never the
  // visible one) keeps a modest disc — enough to put a believable highlight in
  // glossy surfaces — and lets the real light do the rest.
  bakeSky.material = bakeSky.material.clone();
  bakeSky.material.fragmentShader = bakeSky.material.fragmentShader.replace(
    'vSunE * 19000.0 * Fex',
    'vSunE * 90.0 * Fex'
  );
  bakeScene.add(bakeSky);
  let envRT = null;
  let pendingBake = null; // preset waiting for a renderer to arrive

  const prevFog = scene.fog;
  const prevEnv = scene.environment;
  const prevEnvIntensity = scene.environmentIntensity ?? 1;

  let current = null;
  let currentName = null;

  function applyPreset(name, renderer) {
    const p = PRESETS[name] || PRESETS.interior;
    current = p;
    currentName = name;
    lastBakeK = -1; // a later blend must re-bake from scratch
    if (renderer && p.exposure !== undefined) renderer.toneMappingExposure = p.exposure;

    const outdoor = !p.interior && !p.none;
    sky.visible = outdoor;
    clouds.visible = outdoor && !!p.cloud;
    stars.visible = outdoor && !!p.stars;
    sunLight.visible = outdoor;
    bounce.visible = outdoor;

    if (outdoor) {
      const u = sky.material.uniforms;
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = p.mie;
      u.mieDirectionalG.value = p.mieG;

      // Sun direction in the anchor's LOCAL frame: elevation off the local
      // horizon, azimuth about local +Y. The cloud raymarch and the sun light
      // are both anchor-local, so they use this directly; the Sky shader wants
      // world space, which refreshWorldFrame() derives below.
      const phi = THREE.MathUtils.degToRad(p.elevation);
      const theta = THREE.MathUtils.degToRad(p.azimuth);
      _sunLocal.set(
        Math.cos(phi) * Math.sin(theta),
        Math.sin(phi),
        Math.cos(phi) * Math.cos(theta)
      ).normalize();
      sunLight.position.copy(_sunLocal).multiplyScalar(120);
      sunLight.color.set(p.sunColor);
      sunLight.intensity = p.sunIntensity;

      if (p.cloud) {
        const cu = cloudMat.uniforms;
        cu.uCover.value = p.cloud.cover;
        cu.uAltitude.value = p.cloud.altitude;
        cu.uThickness.value = p.cloud.thickness;
        cu.uDrift.value = p.cloud.drift;
        cu.uTint.value.set(p.cloud.tint);
        cu.uSunColor.value.set(p.sunColor);
        cu.uSunDir.value.copy(_sunLocal);
        cu.uAmbient.value = p.cloud.ambient ?? 2.6;
      }
      starMat.uniforms.uAmount.value = p.stars || 0;
      refreshWorldFrame();
    }

    // Fog: matched to the preset's horizon so distance reads as air.
    if (p.fog) {
      scene.fog = scene.fog instanceof THREE.FogExp2 ? scene.fog : new THREE.FogExp2(0, 0);
      scene.fog.color.set(p.fog.color);
      scene.fog.density = p.fog.density;
    } else {
      scene.fog = null;
    }

    bakeEnvironment(renderer, p);
  }

  // Zone 8 burns its fire down over 90 seconds and the sky has to go with it —
  // dusk into night, continuously. This lerps every field of two presets so the
  // change is a real transition rather than a cut. The environment map is the
  // one thing not updated per frame: re-baking a PMREM cube every frame would
  // be absurd, and indirect light changes slowly enough that stepping it at
  // ~12% intervals is invisible.
  const _blend = { fog: {}, cloud: {} };
  let lastBakeK = -1;
  function applyBlend(nameA, nameB, k, renderer) {
    const a = PRESETS[nameA], b = PRESETS[nameB];
    if (!a || !b || a.interior || a.none || b.interior || b.none) return;
    const L = (x, y) => x + (y - x) * k;
    current = _blend;
    currentName = `${nameA}->${nameB}`;

    sky.visible = clouds.visible = sunLight.visible = bounce.visible = true;
    stars.visible = (a.stars || 0) > 0 || (b.stars || 0) > 0;

    const u = sky.material.uniforms;
    u.turbidity.value = L(a.turbidity, b.turbidity);
    u.rayleigh.value = L(a.rayleigh, b.rayleigh);
    u.mieCoefficient.value = L(a.mie, b.mie);
    u.mieDirectionalG.value = L(a.mieG, b.mieG);

    const phi = THREE.MathUtils.degToRad(L(a.elevation, b.elevation));
    const theta = THREE.MathUtils.degToRad(L(a.azimuth, b.azimuth));
    _sunLocal.set(
      Math.cos(phi) * Math.sin(theta), Math.sin(phi), Math.cos(phi) * Math.cos(theta)
    ).normalize();
    sunLight.color.set(a.sunColor).lerp(_c.set(b.sunColor), k);
    sunLight.intensity = L(a.sunIntensity, b.sunIntensity);

    const cu = cloudMat.uniforms;
    cu.uCover.value = L(a.cloud.cover, b.cloud.cover);
    cu.uAltitude.value = L(a.cloud.altitude, b.cloud.altitude);
    cu.uThickness.value = L(a.cloud.thickness, b.cloud.thickness);
    cu.uDrift.value = L(a.cloud.drift, b.cloud.drift);
    cu.uTint.value.set(a.cloud.tint).lerp(_c.set(b.cloud.tint), k);
    cu.uSunColor.value.copy(sunLight.color);
    cu.uSunDir.value.copy(_sunLocal);
    cu.uAmbient.value = L(a.cloud.ambient ?? 2.6, b.cloud.ambient ?? 2.6);
    starMat.uniforms.uAmount.value = L(a.stars || 0, b.stars || 0);

    if (!(scene.fog instanceof THREE.FogExp2)) scene.fog = new THREE.FogExp2(0, 0);
    scene.fog.color.set(a.fog.color).lerp(_c.set(b.fog.color), k);
    scene.fog.density = L(a.fog.density, b.fog.density);
    if (renderer) renderer.toneMappingExposure = L(a.exposure ?? 0.32, b.exposure ?? 0.32);

    refreshWorldFrame();

    if (Math.abs(k - lastBakeK) > 0.12) {
      lastBakeK = k;
      _blend.turbidity = u.turbidity.value;
      _blend.rayleigh = u.rayleigh.value;
      _blend.mie = u.mieCoefficient.value;
      _blend.mieG = u.mieDirectionalG.value;
      _blend.envIntensity = L(a.envIntensity ?? 1, b.envIntensity ?? 1);
      bakeEnvironment(renderer, _blend);
    }
  }

  // The Sky shader and the environment map both work in WORLD space, while the
  // cloud march and the sun light work in the anchor's local frame. This is the
  // one place the two are reconciled. Cheap enough to run per frame — origin
  // rebasing translates the anchor constantly, and while the planet is
  // spin-frozen on this world we don't want to depend on that staying true.
  function refreshWorldFrame() {
    anchor.updateWorldMatrix(true, false);
    anchor.getWorldQuaternion(_q);
    _upWorld.set(0, 1, 0).applyQuaternion(_q).normalize();
    _sunWorld.copy(_sunLocal).applyQuaternion(_q).normalize();
    const u = sky.material.uniforms;
    u.up.value.copy(_upWorld);
    u.sunPosition.value.copy(_sunWorld).multiplyScalar(SKY_SCALE);
  }

  // Render the sky (sun position and all) into a PMREM cube so every PBR
  // material in the zone is lit by the actual sky above it. Called on preset
  // change only — always inside a fade-to-black.
  //
  // Baked in WORLD orientation (same uniforms as the visible sky) so the result
  // drops straight into scene.environment with no rotation correction.
  function bakeEnvironment(renderer, p) {
    if (!renderer) { pendingBake = p; return; }
    pendingBake = null;
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    if (envRT) { envRT.dispose(); envRT = null; }
    if (p.none) {
      scene.environment = null;
      scene.environmentIntensity = 0;
      return;
    }
    if (p.interior) {
      // No sky to bake — a flat neutral probe keeps reflections from going
      // pitch black without pretending there's daylight indoors.
      bakeScene.background = new THREE.Color(p.ambient ?? 0x2a2c33);
      bakeScene.remove(bakeSky);
    } else {
      bakeScene.background = null;
      bakeScene.add(bakeSky);
      const bu = bakeSky.material.uniforms;
      bu.turbidity.value = p.turbidity;
      bu.rayleigh.value = p.rayleigh;
      bu.mieCoefficient.value = p.mie;
      bu.mieDirectionalG.value = p.mieG;
      bu.up.value.copy(sky.material.uniforms.up.value);
      bu.sunPosition.value.copy(sky.material.uniforms.sunPosition.value);
    }
    // far MUST clear the sky shell — the default (100) would clip a 3000-unit
    // box entirely and bake a black environment.
    envRT = pmrem.fromScene(bakeScene, 0.04, 0.1, SKY_SCALE * 2);
    scene.environment = envRT.texture;
    scene.environmentIntensity = p.envIntensity ?? 1;
  }

  // Per-frame. `playerLocal` is the player in anchor-local space — the sky
  // rides with them so the horizon never slides.
  function update(t, dt, playerLocal, renderer) {
    // A late bake, if the preset was set before a renderer was available.
    if (pendingBake && renderer) bakeEnvironment(renderer, pendingBake);
    if (!current || current.none) return;

    // The sky rides with the player so the horizon never slides underfoot.
    sky.position.copy(playerLocal);
    clouds.position.copy(playerLocal);
    stars.position.copy(playerLocal);

    refreshWorldFrame();

    if (clouds.visible) cloudMat.uniforms.uTime.value = t;
    if (stars.visible) starMat.uniforms.uTime.value = t;

    // Keep the shadow camera centred on the player, so its box is always spent
    // where contact shadows are actually visible rather than on empty ground.
    sunLight.target.position.copy(playerLocal);
    sunLight.position.copy(_sunLocal).multiplyScalar(120).add(playerLocal);
  }

  function setShadowExtent(halfExtent, far = 260) {
    const c = sunLight.shadow.camera;
    c.left = -halfExtent; c.right = halfExtent;
    c.top = halfExtent; c.bottom = -halfExtent;
    c.far = far;
    c.updateProjectionMatrix();
  }

  function dispose() {
    scene.fog = prevFog;
    scene.environment = prevEnv;
    scene.environmentIntensity = prevEnvIntensity;
    if (envRT) envRT.dispose();
    if (pmrem) pmrem.dispose();
    bakeSky.geometry.dispose();
    bakeSky.material.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    sunLight.shadow.map?.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const tx of texs) tx.dispose();
  }

  return {
    applyPreset,
    applyBlend,
    update,
    setShadowExtent,
    dispose,
    sunLight,
    get preset() { return currentName; },
    get sunDirLocal() { return _sunLocal; },
    // Live knobs, for headless exposure calibration.
    tune(o = {}) {
      if (o.env !== undefined) scene.environmentIntensity = o.env;
      if (o.sun !== undefined) sunLight.intensity = o.sun;
      if (o.bounce !== undefined) bounce.intensity = o.bounce;
      if (o.cloudOpacity !== undefined) cloudMat.uniforms.uOpacity.value = o.cloudOpacity;
      return {
        env: scene.environmentIntensity, sun: sunLight.intensity,
        bounce: bounce.intensity, preset: currentName,
      };
    },
  };
}
