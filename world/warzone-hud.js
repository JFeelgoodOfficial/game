// Warzone HUD — DOM/CSS overlay, the same approach Claude of Duty's ui
// subsystem takes (no canvas text, nothing in the 3D scene). Built on create,
// removed on dispose; every per-frame write is a cached-value compare so the
// DOM is only touched when something visibly changes.
//
// Pieces: a dynamic-spread crosshair, hitmarker (white / red on a kill, gold
// on a headshot), ammo + weapon block, health bar plus the full-screen damage
// vignette, directional damage arcs that point at whoever shot you, a score
// popup, the wave banner, hostile counter, and the KIA / redeploy card.

const CSS = `
#wz-hud { position: fixed; inset: 0; pointer-events: none; user-select: none;
  z-index: 11; font-family: 'Courier New', ui-monospace, monospace; color: #e8f3f5; }
#wz-hud.off { display: none; }
#wz-vignette { position: absolute; inset: 0; opacity: 0;
  background: radial-gradient(ellipse at center, rgba(120,0,0,0) 38%, rgba(150,8,8,0.55) 78%, rgba(90,0,0,0.9) 100%); }
#wz-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#wz-cross i { position: absolute; background: rgba(240,250,250,0.92);
  box-shadow: 0 0 2px rgba(0,0,0,0.9); }
#wz-cross i.h { width: 9px; height: 2px; top: -1px; }
#wz-cross i.v { width: 2px; height: 9px; left: -1px; }
#wz-cross b { position: absolute; left: -1px; top: -1px; width: 2px; height: 2px;
  background: rgba(240,250,250,0.8); }
#wz-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; }
#wz-hit i { position: absolute; width: 11px; height: 2px; background: #fff;
  box-shadow: 0 0 2px #000; left: -5px; top: -1px; }
#wz-hit.kill i { background: #ff3b30; }
#wz-hit.head i { background: #ffd23f; }
#wz-ammo { position: absolute; right: 34px; bottom: 30px; text-align: right;
  text-shadow: 0 1px 3px #000; }
#wz-ammo .mag { font-size: 40px; font-weight: bold; letter-spacing: 1px; }
#wz-ammo .mag.low { color: #ff5a4a; }
#wz-ammo .res { font-size: 18px; opacity: 0.75; margin-left: 4px; }
#wz-ammo .name { font-size: 12px; letter-spacing: 3px; opacity: 0.7; margin-top: 2px; }
#wz-ammo .hint { font-size: 13px; letter-spacing: 2px; color: #ffd23f; height: 16px; }
#wz-health { position: absolute; left: 50%; bottom: 26px; width: 220px; transform: translateX(-50%);
  text-align: center; }
#wz-health .lbl { font-size: 11px; letter-spacing: 3px; opacity: 0.7; margin-bottom: 4px;
  text-shadow: 0 1px 2px #000; }
#wz-health .bar { height: 7px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.25); }
#wz-health .fill { height: 100%; width: 100%; background: #e8f3f5; transition: width 0.12s; }
#wz-health .fill.low { background: #ff4a3a; }
#wz-top { position: absolute; top: 14px; left: 18px;
  text-align: left; text-shadow: 0 1px 3px #000; }
#wz-top .zone { font-size: 12px; letter-spacing: 4px; opacity: 0.8; }
#wz-top .stats { font-size: 13px; letter-spacing: 2px; margin-top: 3px; }
#wz-top .stats .hostile { color: #ff6b5a; }
#wz-banner { position: absolute; top: 24%; left: 50%; transform: translateX(-50%);
  text-align: center; opacity: 0; transition: opacity 0.35s; text-shadow: 0 2px 6px #000; }
#wz-banner .big { font-size: 34px; font-weight: bold; letter-spacing: 6px; }
#wz-banner .small { font-size: 14px; letter-spacing: 3px; margin-top: 6px; opacity: 0.85; }
#wz-score { position: absolute; left: 50%; top: 56%; transform: translateX(-50%);
  font-size: 18px; font-weight: bold; color: #ffd23f; opacity: 0; text-shadow: 0 1px 3px #000; }
#wz-arcs { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#wz-arcs i { position: absolute; left: -60px; top: -170px; width: 120px; height: 34px;
  border-top: 5px solid rgba(255,40,30,0.9); border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  transform-origin: 60px 170px; opacity: 0; }
/* Touch: the sticks own both bottom corners, and the stats line moved up-left,
   so ammo goes top-right and armor sits under the stats. */
@media (pointer: coarse) {
  #wz-ammo { top: 12px; bottom: auto; right: 18px; }
  #wz-ammo .mag { font-size: 30px; }
  #wz-ammo .hint { position: absolute; right: 0; top: 64px; white-space: nowrap; }
  #wz-health { left: 18px; top: 58px; bottom: auto; transform: none; width: 170px; text-align: left; }
  #wz-top .zone, #wz-top .stats { font-size: 11px; letter-spacing: 1px; }
}
#wz-dead { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; background: rgba(60,0,0,0.55);
  opacity: 0; transition: opacity 0.4s; text-shadow: 0 2px 6px #000; }
#wz-dead .big { font-size: 42px; font-weight: bold; letter-spacing: 8px; color: #ff5040; }
#wz-dead .small { font-size: 15px; letter-spacing: 3px; margin-top: 10px; }
`;

const ARC_COUNT = 4;

export function createWarzoneHud(zoneName) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'wz-hud';
  root.innerHTML = `
    <div id="wz-vignette"></div>
    <div id="wz-arcs">${'<i></i>'.repeat(ARC_COUNT)}</div>
    <div id="wz-cross"><i class="h"></i><i class="h"></i><i class="v"></i><i class="v"></i><b></b></div>
    <div id="wz-hit"><i></i><i></i><i></i><i></i></div>
    <div id="wz-score"></div>
    <div id="wz-top"><div class="zone"></div><div class="stats"></div></div>
    <div id="wz-banner"><div class="big"></div><div class="small"></div></div>
    <div id="wz-health"><div class="lbl">ARMOR</div><div class="bar"><div class="fill"></div></div></div>
    <div id="wz-ammo"><div class="hint"></div><span class="mag">30</span><span class="res">/ 210</span><div class="name"></div></div>
    <div id="wz-dead"><div class="big">KILLED IN ACTION</div><div class="small"></div></div>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const vignette = $('#wz-vignette');
  const crossBars = root.querySelectorAll('#wz-cross i');
  const crossDot = $('#wz-cross b');
  const hit = $('#wz-hit');
  const hitBars = root.querySelectorAll('#wz-hit i');
  const score = $('#wz-score');
  const zoneEl = $('#wz-top .zone');
  const statsEl = $('#wz-top .stats');
  const banner = $('#wz-banner');
  const bannerBig = $('#wz-banner .big');
  const bannerSmall = $('#wz-banner .small');
  const healthFill = $('#wz-health .fill');
  const magEl = $('#wz-ammo .mag');
  const resEl = $('#wz-ammo .res');
  const nameEl = $('#wz-ammo .name');
  const hintEl = $('#wz-ammo .hint');
  const arcs = [...root.querySelectorAll('#wz-arcs i')];
  const dead = $('#wz-dead');
  const deadSmall = $('#wz-dead .small');

  zoneEl.textContent = `${zoneName.toUpperCase()} — COMBAT ZONE`;

  // Hit-marker bars: four short diagonals around the centre.
  const HIT_ANG = [45, 135, 225, 315];
  hitBars.forEach((b, i) => {
    b.style.transform = `rotate(${HIT_ANG[i]}deg) translateX(13px)`;
  });

  const st = {
    spread: -1, mag: -1, res: -1, health: -1, stats: '', hint: null,
    hitT: 0, scoreT: 0, bannerT: 0, crossVis: true, vig: -1,
    arcT: new Float32Array(ARC_COUNT), arcAng: new Float32Array(ARC_COUNT), arcNext: 0,
    deadShown: false,
  };

  function setCrosshair(spreadPx, visible) {
    if (visible !== st.crossVis) {
      st.crossVis = visible;
      for (const b of crossBars) b.style.opacity = visible ? '1' : '0';
      crossDot.style.opacity = visible ? '1' : '0';
    }
    const s = Math.round(spreadPx);
    if (s === st.spread) return;
    st.spread = s;
    const g = 4 + s;
    crossBars[0].style.transform = `translate(${-g - 9}px, 0)`;
    crossBars[1].style.transform = `translate(${g}px, 0)`;
    crossBars[2].style.transform = `translate(0, ${-g - 9}px)`;
    crossBars[3].style.transform = `translate(0, ${g}px)`;
  }

  function setAmmo(mag, reserve, magSize, name) {
    if (mag !== st.mag) {
      st.mag = mag;
      magEl.textContent = String(mag);
      magEl.classList.toggle('low', mag <= Math.floor(magSize * 0.25));
    }
    if (reserve !== st.res) {
      st.res = reserve;
      resEl.textContent = `/ ${reserve}`;
    }
    if (nameEl.textContent !== name) nameEl.textContent = name;
  }

  function setHint(text) {
    if (text === st.hint) return;
    st.hint = text;
    hintEl.textContent = text ?? '';
  }

  function setHealth(h01) {
    const q = Math.round(h01 * 100);
    if (q !== st.health) {
      st.health = q;
      healthFill.style.width = `${q}%`;
      healthFill.classList.toggle('low', q < 35);
    }
    // Vignette ramps in below 70% armor, CoD-style: the screen tells you
    // before the bar does.
    const v = Math.round(Math.max(0, Math.min(1, (0.7 - h01) / 0.6)) * 100) / 100;
    if (v !== st.vig) {
      st.vig = v;
      vignette.style.opacity = String(v);
    }
  }

  function setStats(text) {
    if (text === st.stats) return;
    st.stats = text;
    statsEl.innerHTML = text;
  }

  function hitmarker(kind) {
    hit.classList.toggle('kill', kind === 'kill');
    hit.classList.toggle('head', kind === 'head');
    st.hitT = kind === 'kill' ? 0.42 : 0.2;
  }

  function popScore(text) {
    score.textContent = text;
    st.scoreT = 1.1;
  }

  function showBanner(big, small, secs = 3) {
    bannerBig.textContent = big;
    bannerSmall.textContent = small ?? '';
    banner.style.opacity = '1';
    st.bannerT = secs;
  }

  // angleRad: bearing of the attacker relative to where you are looking,
  // 0 = dead ahead, +pi/2 = to your right.
  function damageFrom(angleRad) {
    const i = st.arcNext;
    st.arcNext = (i + 1) % ARC_COUNT;
    st.arcT[i] = 1.4;
    st.arcAng[i] = angleRad;
    arcs[i].style.transform = `rotate(${(angleRad * 180) / Math.PI}deg)`;
  }

  function setDead(on, text) {
    if (on !== st.deadShown) {
      st.deadShown = on;
      dead.style.opacity = on ? '1' : '0';
    }
    if (on && text !== undefined && deadSmall.textContent !== text) deadSmall.textContent = text;
  }

  function setVisible(on) {
    root.classList.toggle('off', !on);
  }

  function update(dt) {
    if (st.hitT > 0) {
      st.hitT -= dt;
      hit.style.opacity = st.hitT > 0 ? String(Math.min(1, st.hitT * 6)) : '0';
    }
    if (st.scoreT > 0) {
      st.scoreT -= dt;
      score.style.opacity = st.scoreT > 0 ? String(Math.min(1, st.scoreT * 2.5)) : '0';
    }
    if (st.bannerT > 0) {
      st.bannerT -= dt;
      if (st.bannerT <= 0) banner.style.opacity = '0';
    }
    for (let i = 0; i < ARC_COUNT; i++) {
      if (st.arcT[i] <= 0) continue;
      st.arcT[i] -= dt;
      arcs[i].style.opacity = st.arcT[i] > 0 ? String(Math.min(1, st.arcT[i])) : '0';
    }
  }

  function dispose() {
    root.remove();
    style.remove();
  }

  return {
    setCrosshair, setAmmo, setHint, setHealth, setStats, hitmarker, popScore,
    showBanner, damageFrom, setDead, setVisible, update, dispose,
  };
}
