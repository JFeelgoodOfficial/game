/**
 * wyattmattoe-storm.js — the mountain's weather.
 *
 * Every few minutes on foot a snowstorm rolls over the basecamp: the sky goes
 * a bruised purple, the air fills with driven snow, visibility closes in to a
 * couple of hundred units and a gusting wind leans on the walker hard enough
 * to drift them across the slope. When it blows through, the cloud tears open
 * on a dusk-dark sky and an aurora hangs over the range for a minute or so
 * before the day comes back.
 *
 *   calm ──(2.5–4 min)──▶ storm (30–45 s) ──▶ aurora (60–75 s) ──▶ calm
 *
 * WHO OWNS WHAT. This module owns its own drawables (a sky dome, the snow, the
 * aurora curtains — all in a rig that rides the player) and a small `weather`
 * record. It never touches scene.fog, the sun, the environment or the tone
 * mapping itself: world/planetsky.js rewrites all of those every frame, so the
 * storm hands it `weather` once (planetSky.setWeather) and planetsky folds the
 * numbers in after its own blend. That is also what makes teardown safe: with
 * the storm gone, the very next sky frame is a clean one, and planetsky's
 * dispose puts the flight sim's fog and environment back exactly as it always
 * has. Nothing here is a global.
 *
 * THE CLOCK runs in step() — the physics tick — not in the render update, so
 * the wind is deterministic under __debug.walkStep and a storm lasts the same
 * number of simulated seconds whatever the frame rate.
 *
 * THE WIND is a displacement, not a force. The walker's ground velocity snaps
 * to the wish direction within a couple of ticks (WALK_ACCEL_GROUND), so
 * anything added to walk.vel would be erased; walk.js instead adds the wind's
 * tangent drift straight to the position, before its collision pass, so walls
 * and wonders still stop you. The push runs ~1.2 u/s in the lulls to ~4.2 in a
 * slam, against a walk of 8 and a sprint of 16: you can always make headway,
 * but stand still and a 40 s storm carries you ~80 u.
 *
 * Zero per-frame allocation.
 */

import * as THREE from 'three';

const RAMP_IN = 6; // s for a storm to build
const RAMP_OUT = 8; // s for it to blow through
const AURORA_IN = 7;
const AURORA_OUT = 14;
const WIND_BASE = 1.2; // u/s of drift in the lulls of a full storm
const WIND_GUST = 3.0; // extra at the top of a gust
const WIND_AIR = 1.4; // airborne (a jump, a big air) the wind has more of you
const SNOW_BOX = 56; // side of the wrapping snow volume around the camera
const SNOW_TALL = 36;
const DOME_R = 2500; // inside planetsky's cloud dome (2700) and the 4000 far plane

const _yAxis = new THREE.Vector3(0, 1, 0);
const STORM_FOG = new THREE.Color(0.52, 0.43, 0.78);
const DUSK_FOG = new THREE.Color(0.1, 0.1, 0.24);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

export function createWyattStorm(ctx = {}) {
  const lowQuality = ctx.quality === 'low';
  const rng = mulberry32(ctx.seed ?? 0x5709a1);
  const group = new THREE.Group();
  group.name = 'wyattmattoe-storm';
  // The rig rides the player with +Y on their radial up (planetsky's anchor
  // idiom), so "down" and "the horizon" are constants inside it.
  const rig = new THREE.Group();
  group.add(rig);

  /* --- Sky dome: storm cloud and the dusk the aurora hangs in ------------ */
  // Preetham cannot be talked into purple, so the storm paints over it: an
  // opaque-at-peak dome between planetsky's cloud slab and the world.
  const domeGeo = new THREE.SphereGeometry(DOME_R, 32, 18);
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uDusk: { value: 0 },
      uFog: { value: new THREE.Color() }, // the live scene fog: the horizon must match it
      uGain: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStorm, uDusk, uGain;
      uniform vec3 uFog;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        // Cloud deck: project the view ray onto a plane overhead so the
        // texture streams toward the horizon the way a low ceiling does.
        vec2 uv = d.xz / (h + 0.22);
        float n = fbm(uv * 1.6 + vec2(uTime * 0.11, uTime * 0.05));
        float n2 = fbm(uv * 4.3 - vec2(uTime * 0.19, 0.0));
        float churn = n * 0.7 + n2 * 0.3;
        vec3 belly = vec3(0.20, 0.11, 0.36);
        vec3 lit = vec3(0.62, 0.47, 0.92);
        vec3 storm = mix(belly, lit, smoothstep(0.3, 0.8, churn)) * uGain;
        // Distant weather is just fog: melt into the horizon colour.
        storm = mix(uFog, storm, smoothstep(0.0, 0.3, h));

        vec3 dusk = mix(vec3(0.16, 0.14, 0.34), vec3(0.015, 0.02, 0.07), smoothstep(0.0, 0.7, h)) * uGain;
        // A few hard stars through the torn cloud.
        vec2 sp = d.xz / (h + 0.4) * 46.0;
        float star = step(0.992, hash21(floor(sp))) * smoothstep(0.2, 0.0, length(fract(sp) - 0.5));
        dusk += vec3(0.8, 0.85, 1.0) * star * smoothstep(0.1, 0.4, h) * 1.1;
        dusk = mix(uFog, dusk, smoothstep(0.0, 0.18, h));

        float w = uStorm / max(uStorm + uDusk, 1e-4);
        vec3 col = mix(dusk, storm, w);
        gl_FragColor = vec4(col, clamp(max(uStorm, uDusk), 0.0, 1.0));
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true, // behind the mountains, like planetsky's cloud dome
    fog: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -999; // after planetsky's sky (-1002), stars and clouds (-1000)
  dome.userData.noShadow = true;
  dome.visible = false;
  rig.add(dome);

  /* --- Driven snow ------------------------------------------------------- */
  // One Points draw in a box that wraps around the camera. The CPU integrates
  // a single offset (wind + fall - the walker's own motion); the shader wraps
  // every flake by it, so the flakes hold still in the world as you move and
  // a gust bends the whole field without any per-particle work.
  const SNOW = lowQuality ? 3500 : 9000;
  const snowPos = new Float32Array(SNOW * 3);
  const snowSeed = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = rng() * SNOW_BOX;
    snowPos[i * 3 + 1] = rng() * SNOW_TALL;
    snowPos[i * 3 + 2] = rng() * SNOW_BOX;
    snowSeed[i] = rng();
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(snowSeed, 1));
  snowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SNOW_BOX);
  const snowMat = new THREE.ShaderMaterial({
    uniforms: {
      uOffset: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uOffset;
      uniform float uTime, uAmount, uScale;
      attribute float aSeed;
      varying float vFade;
      void main() {
        vec3 box = vec3(${SNOW_BOX.toFixed(1)}, ${SNOW_TALL.toFixed(1)}, ${SNOW_BOX.toFixed(1)});
        // Each flake rides the shared field at its own pace, so the snow has
        // depth instead of sliding past as one sheet.
        vec3 p = mod(position + uOffset * (0.7 + 0.6 * aSeed), box) - box * 0.5;
        p.x += sin(uTime * 2.3 + aSeed * 40.0) * 0.5;
        p.y += cos(uTime * 1.9 + aSeed * 23.0) * 0.35 + 6.0;
        // Fade toward the box walls so the wrap is never a visible edge.
        float edge = max(abs(p.x), abs(p.z)) / (box.x * 0.5);
        vFade = (1.0 - smoothstep(0.72, 1.0, edge)) * uAmount;
        // Thin the field with the storm: flake i shows once uAmount passes aSeed.
        vFade *= smoothstep(aSeed * 0.7, aSeed * 0.7 + 0.3, uAmount);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((40.0 + aSeed * 80.0) * uScale / max(-mv.z, 0.5), 1.8, 16.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying float vFade;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, r) * vFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uTint, a * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.renderOrder = 3;
  snow.visible = false;
  snow.userData.noShadow = true;
  rig.add(snow);

  /* --- Aurora ------------------------------------------------------------ */
  // Curtains: long vertical ribbons, folded in the vertex shader, lit along
  // the bottom hem and streaked with rays, additive over the dusk dome.
  const auroraMats = [];
  const auroraGeos = [];
  const ribbons = [];
  const RIBBONS = lowQuality ? 2 : 4;
  for (let i = 0; i < RIBBONS; i++) {
    const geo = new THREE.PlaneGeometry(1, 1, 110, 1);
    auroraGeos.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uSeed: { value: rng() * 50 },
        uLen: { value: 2600 + rng() * 900 },
        uTall: { value: 420 + rng() * 260 },
        uBase: { value: 520 + i * 90 + rng() * 80 },
        uDist: { value: 1250 + i * 170 },
        uGain: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uSeed, uLen, uTall, uBase, uDist;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          float x = (uv.x - 0.5) * uLen;
          // Slow, large folds plus a faster ripple running along the curtain.
          float fold = sin(x * 0.0031 + uSeed + uTime * 0.11) * 210.0
                     + sin(x * 0.0093 - uSeed * 1.7 - uTime * 0.23) * 80.0
                     + sin(x * 0.027 + uTime * 0.6) * 16.0;
          vec3 p = vec3(x, uBase + uv.y * uTall, -uDist + fold);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAmount, uSeed, uLen, uGain;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          float x = vUv.x * uLen;
          // Rays: fine vertical striations that drift and flicker.
          float rays = vnoise(vec2(x * 0.035 + uTime * 0.35, uSeed)) * 0.6
                     + vnoise(vec2(x * 0.11 - uTime * 0.5, uSeed + 9.0)) * 0.4;
          rays = 0.35 + 0.9 * rays * rays;
          // Patches of the curtain breathe in and out along its length.
          float breathe = smoothstep(0.25, 0.7, vnoise(vec2(x * 0.0022 + uTime * 0.05, uSeed * 3.0)));
          // Bright hem, long fade upward.
          float v = vUv.y;
          float profile = smoothstep(0.0, 0.06, v) * pow(1.0 - v, 1.7);
          float ends = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
          vec3 green = vec3(0.16, 1.0, 0.46);
          vec3 violet = vec3(0.62, 0.22, 1.0);
          vec3 col = mix(green, violet, smoothstep(0.05, 0.55, v));
          float a = profile * rays * (0.3 + 0.7 * breathe) * ends * uAmount;
          gl_FragColor = vec4(col * a * uGain, a);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    auroraMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; // the vertex shader moves every vertex
    mesh.renderOrder = -998; // over the storm dome, under the world
    mesh.userData.noShadow = true;
    mesh.rotation.y = (i / RIBBONS) * Math.PI * 2 + rng() * 0.6; // ring the horizon
    mesh.visible = false;
    rig.add(mesh);
    ribbons.push(mesh);
  }

  /* --- State ------------------------------------------------------------- */
  let phase = 'calm';
  let clock = 0; // seconds into the current phase
  let span = 75 + rng() * 45; // length of the current phase; the first calm is short
  let total = 0; // lifetime seconds, for gust phases
  let storm = 0; // 0..1 storm intensity
  let aurora = 0; // 0..1 aurora (and dusk) amount
  let windSpeed = 0; // current drift speed, u/s
  let windAngle = rng() * Math.PI * 2; // this storm's bearing about the site's up
  let storms = 0; // storms begun this visit
  const gustA = rng() * 6.28;
  const gustB = rng() * 6.28;
  const smooth01 = (x) => { const c = Math.min(Math.max(x, 0), 1); return c * c * (3 - 2 * c); };

  // What planetsky folds into its own per-frame sky state.
  const weather = {
    k: 0, // 0 = no weather at all (planetsky skips the whole block)
    fogColor: new THREE.Color(),
    fogDensity: 0, // ADDED to the preset's density
    sunScale: 1,
    envScale: 1,
  };

  function begin(next) {
    phase = next;
    clock = 0;
    if (next === 'storm') {
      span = 30 + rng() * 15;
      windAngle = rng() * Math.PI * 2;
      storms++;
    } else if (next === 'aurora') {
      span = 60 + rng() * 15;
    } else {
      span = 150 + rng() * 90;
    }
  }

  const _wind = new THREE.Vector3();
  const _windDir = new THREE.Vector3(1, 0, 0); // unit, surface-local, where the wind is going
  const _t1 = new THREE.Vector3();
  const _t2 = new THREE.Vector3();
  const _up = new THREE.Vector3();

  // Physics tick. Advances the weather clock and, when the wind is blowing,
  // writes this tick's drift (surface-local, tangent to the ground at `pos`)
  // into `out`. Returns true if `out` is non-zero.
  function step(dt, pos, airborne, out) {
    clock += dt;
    total += dt;
    if (clock >= span) begin(phase === 'calm' ? 'storm' : phase === 'storm' ? 'aurora' : 'calm');

    if (phase === 'storm') {
      storm = smooth01(clock / RAMP_IN) * smooth01((span - clock) / RAMP_OUT);
      // The aurora's dusk starts gathering under the last of the cloud, so
      // the storm clears onto a dark sky rather than back to noon and out again.
      aurora = smooth01((clock - (span - RAMP_OUT)) / RAMP_OUT) * 0.55;
    } else if (phase === 'aurora') {
      storm = 0;
      aurora = Math.max(0.55 * (1 - smooth01(clock / 2)), smooth01(clock / AURORA_IN))
        * smooth01((span - clock) / AURORA_OUT);
    } else {
      storm = 0;
      aurora = 0;
    }

    // Gusts: two beating sines for the swell, a cubed one for the slams.
    const swell = 0.5 + 0.5 * Math.sin(total * 0.83 + gustA) * Math.sin(total * 0.29 + gustB);
    const slam = Math.pow(Math.max(0, Math.sin(total * 1.31 + gustB)), 3);
    const gust = Math.min(1, 0.65 * swell + 0.5 * slam);
    windSpeed = storm * (WIND_BASE + WIND_GUST * gust);
    if (storm <= 0) return false;

    // Tangent frame at the walker; the bearing wanders a little with the gusts.
    _up.copy(pos).normalize();
    _t1.crossVectors(_up, Math.abs(_up.y) < 0.94 ? _yAxis : _wind.set(1, 0, 0)).normalize();
    _t2.crossVectors(_up, _t1);
    const ang = windAngle + 0.35 * Math.sin(total * 0.21 + gustA);
    _windDir.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
    if (windSpeed < 1e-3 || !out) return false;
    out.copy(_windDir).multiplyScalar(windSpeed * (airborne ? WIND_AIR : 1) * dt);
    return true;
  }

  /* --- Per-frame visuals -------------------------------------------------- */
  const _prev = new THREE.Vector3();
  const _delta = new THREE.Vector3();
  const _inv = new THREE.Quaternion();
  let havePrev = false;
  // `playerLocal` is the walker in planet.surface's frame (the module group
  // sits at identity under it). `fog` is the live scene fog, or null.
  function update(t, dt, playerLocal, fog, sunDot = 1) {
    _up.copy(playerLocal).normalize();
    rig.position.copy(playerLocal);
    rig.quaternion.setFromUnitVectors(_yAxis, _up);

    // Weather record for planetsky (read next frame at the latest).
    const dusk = aurora * (1 - storm);
    const w = Math.max(storm, dusk);
    weather.k = w;
    if (w > 0) {
      weather.fogColor.copy(DUSK_FOG).lerp(STORM_FOG, storm / (storm + dusk));
      // Night storms: the cloud has no daylight to scatter.
      weather.fogColor.multiplyScalar(0.25 + 0.75 * Math.min(1, sunDot * 3));
    }
    // The terrain is a raw shader lit by the planet's own sun uniform: fog is
    // the only thing here that reaches it. So the storm can bury it, but the
    // dusk cannot dim it — the dusk therefore dims the scene lights only part
    // way (or the piste and the lift would go dark against day-bright ground)
    // and lets a thin dusk-coloured haze take the distance instead.
    weather.fogDensity = storm * 0.017 + dusk * 0.0045;
    weather.sunScale = 1 - 0.78 * storm - 0.45 * dusk;
    weather.envScale = 1 - 0.45 * storm - 0.35 * dusk;

    const day = 0.25 + 0.75 * Math.min(1, sunDot * 3);
    dome.visible = w > 0.002;
    if (dome.visible) {
      const u = domeMat.uniforms;
      u.uTime.value = t;
      u.uStorm.value = storm;
      u.uDusk.value = dusk;
      u.uGain.value = day;
      if (fog) u.uFog.value.copy(fog.color);
    }

    snow.visible = storm > 0.002;
    if (snow.visible) {
      // Flakes are fixed in the world: take the walker's own motion back out
      // of the field, in the rig's frame.
      if (havePrev) {
        _inv.copy(rig.quaternion).invert();
        _delta.subVectors(playerLocal, _prev).applyQuaternion(_inv);
        // A teleport (a debug jump, the lift's set-down) is not motion.
        if (_delta.lengthSq() < 400) snowMat.uniforms.uOffset.value.sub(_delta);
      }
      // Snow goes where the push goes: the same wind vector, turned into the
      // rig's frame, and fast enough over the ground to read as driven (the
      // flakes are light — they outrun the drift the walker feels). Fall is slow.
      _inv.copy(rig.quaternion).invert();
      _delta.copy(_windDir).applyQuaternion(_inv);
      const sp = (windSpeed * 3.2 + 4 * storm) * dt;
      const o = snowMat.uniforms.uOffset.value;
      o.x += _delta.x * sp;
      o.z += _delta.z * sp;
      o.y -= 3.2 * dt;
      // Keep the accumulator bounded (the shader wraps it anyway).
      o.x %= SNOW_BOX * 20; o.y %= SNOW_TALL * 20; o.z %= SNOW_BOX * 20;
      snowMat.uniforms.uTime.value = t;
      snowMat.uniforms.uAmount.value = storm;
      snowMat.uniforms.uTint.value.setScalar(1.6 * day);
    }
    _prev.copy(playerLocal);
    havePrev = true;

    const showAurora = aurora > 0.002 && storm < 0.6;
    for (let i = 0; i < ribbons.length; i++) {
      ribbons[i].visible = showAurora;
      if (!showAurora) continue;
      const u = auroraMats[i].uniforms;
      u.uTime.value = t;
      u.uAmount.value = aurora * (1 - storm);
      // Additive light against a sky tone-mapped at day exposure needs to be
      // well over 1 to read; at night the exposure is higher, so ease off.
      u.uGain.value = 2.2 + 3.0 * Math.min(1, sunDot * 3);
    }
  }

  function setPixelScale(s) {
    snowMat.uniforms.uScale.value = s;
  }

  // Debug / verification: start a storm now (optionally of a given length).
  function trigger(seconds) {
    begin('storm');
    if (seconds) span = seconds;
  }
  // ... or cut straight to the aurora, or clear the sky.
  function triggerAurora(seconds) {
    begin('aurora');
    if (seconds) span = seconds;
  }
  function clear() {
    begin('calm');
    storm = 0;
    aurora = 0;
    windSpeed = 0;
  }

  function dispose() {
    weather.k = 0; // anything still holding the record sees clear air
    weather.fogDensity = 0;
    weather.sunScale = 1;
    weather.envScale = 1;
    domeGeo.dispose();
    domeMat.dispose();
    snowGeo.dispose();
    snowMat.dispose();
    for (const g of auroraGeos) g.dispose();
    for (const m of auroraMats) m.dispose();
    group.clear();
    group.parent?.remove(group);
  }

  return {
    group, step, update, dispose, weather, setPixelScale,
    trigger, triggerAurora, clear,
    // Headless verification.
    debug() {
      return {
        phase, clock, span, storm, aurora, windSpeed, windAngle, storms,
        nextStormIn: phase === 'calm' ? span - clock : null,
        snowVisible: snow.visible, domeVisible: dome.visible,
        auroraVisible: ribbons[0].visible,
        weather: {
          k: weather.k, fogDensity: weather.fogDensity, sunScale: weather.sunScale,
          envScale: weather.envScale, fogColor: weather.fogColor.getHex(),
        },
      };
    },
  };
}
