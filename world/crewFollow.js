// Captains who come along (GDD 5.7.8): the same following the Entry Zero
// ground and the epilogue city each wrote for themselves (world/zeroground.js,
// world/lightepilogue.js), once, for any platform a trip takes the pilot to.
//
// A platform (src/capitalWalk.js) that wants its visitors followed makes one of
// these over its own group and hands it the walker each frame:
//
//   const crew = createCrewFollow({ group, floorY, talk });
//   crew.set(ids)                 who is along (captain ids), at `at` [x, z]
//   crew.tick(dt, t, walker)      walker: the live { pos, facingYaw } or null
//   crew.npcs                     talkable, for the platform's npcs list
//
// They keep to slots off the pilot's shoulders, walk when left behind, stand
// and turn to the pilot when not, and are put beside the pilot again if they
// are ever a long way off (a lift, a door). A captain with a fixed `post`
// stands there instead (the bay, where they wait by the freighter).

import { C } from '../src/constants.js';
import { poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { CAPTAINS } from './chapter-dialogue.js';

// behind the right shoulder, behind the left, and further back between them
const SLOTS = [[1, 1], [-1, 1], [0, 2]];

// o: { group, floorY: number | (x, z) => y, talk(captain) -> dialogue payload,
//      post: [[x, z, yaw], ...] | null }
export function createCrewFollow(o) {
  const floor = typeof o.floorY === 'function' ? o.floorY : () => o.floorY || 0;
  const npcs = [];
  const crew = CAPTAINS.map((c) => {
    const npc = { x: 1e6, y: 0, z: 1e6, role: 'captain', talk: () => o.talk(c) };
    npcs.push(npc);
    return { c, rig: null, npc, on: false, slot: 0, yaw: 0, placed: false };
  });
  function rigOf(m) {
    if (!m.rig) {
      m.rig = buildCaptain(m.c.id);
      m.rig.group.visible = false;
      o.group.add(m.rig.group);
    }
    return m.rig;
  }
  return {
    npcs,
    set(ids) {
      let n = 0;
      for (const m of crew) {
        m.on = ids.includes(m.c.id);
        if (m.on) {
          rigOf(m).group.visible = true;
          m.slot = n++;
          m.placed = false;
        } else {
          if (m.rig) m.rig.group.visible = false;
          m.npc.x = m.npc.z = 1e6;
        }
      }
    },
    count: () => crew.filter((m) => m.on).length,
    tick(dt, t, walker) {
      const d = Math.min(dt, 0.1);
      for (const m of crew) {
        if (!m.on) continue;
        const g = m.rig.group.position;
        const post = o.post ? o.post[m.slot % o.post.length] : null;
        let moving = false, pace = 0;
        if (post) {
          g.x = post[0];
          g.z = post[1];
          const near = walker && Math.hypot(walker.pos.x - g.x, walker.pos.z - g.z) < 6;
          m.yaw = near ? Math.atan2(walker.pos.x - g.x, walker.pos.z - g.z) : post[2];
        } else if (walker) {
          const s = SLOTS[m.slot % SLOTS.length];
          const gap = C.BASE_FOLLOW_GAP;
          const sy = Math.sin(walker.facingYaw), cy = Math.cos(walker.facingYaw);
          const tx = walker.pos.x + (-cy * s[0] + sy * s[1]) * gap, tz = walker.pos.z + (sy * s[0] + cy * s[1]) * gap;
          let dx = tx - g.x, dz = tz - g.z, dd = Math.hypot(dx, dz);
          if (!m.placed || dd > 40) {
            // beside the pilot at once: just arrived, or left a long way behind
            g.x = tx;
            g.z = tz;
            m.placed = true;
            dx = dz = dd = 0;
          }
          moving = dd > 0.9;
          if (moving) {
            const step = Math.min(dd - 0.6, C.BASE_FOLLOW_SPEED * d);
            g.x += (dx / dd) * step;
            g.z += (dz / dd) * step;
            pace = Math.min(step / Math.max(d, 1e-4) / 9, 1);
            m.yaw = Math.atan2(dx, dz);
          } else m.yaw = Math.atan2(walker.pos.x - g.x, walker.pos.z - g.z);
        }
        const y = floor(g.x, g.z);
        m.rig.group.rotation.y = m.yaw;
        poseRig(m.rig, d, t, moving ? 'walk' : 'idle', pace);
        standRig(m.rig, Number.isFinite(y) ? y : 0);
        liveCaptain(m.rig, d, t, false, 0);
        m.npc.x = g.x;
        m.npc.z = g.z;
        m.npc.y = Number.isFinite(y) ? y : 0;
      }
    },
    state: () => crew.filter((m) => m.on).map((m) => ({ id: m.c.id, at: [+m.rig.group.position.x.toFixed(1), +m.rig.group.position.z.toFixed(1)] })),
  };
}
