// Feet on the floor, for the figures world/aliens.js builds (GDD 5.7.4).
//
// buildRig() gives each figure a `groundOffset` that is an estimate: it does
// not know how long that figure's legs are, and it does not move as they
// swing, so a figure placed by it stands in the air or in the floor and its
// feet leave the ground in the middle of every stride.
//
// Here the legs are measured once (the lengths are in the rig's joints and
// its params.leg),
// and then each frame, after the pose has been set, the lower of the two feet
// is worked out from the hip and knee angles and the figure is put so that
// that foot is on the floor. The stance foot is planted; the body rides up
// and down over it, as a walker's does. Two cosines a leg, no matrices, no
// allocation.
//
//   measureRig(rig)            once, after buildRig
//   standRig(rig, floorY)      every frame, after poseRig; returns the y it set
//   footY(rig)                 where the lower foot is now (for checks)

function leg(l, m) {
  // hip to knee is in the joints; the shin's length and thickness are the rig's own measure
  return { hip: l.hip, knee: l.knee, upper: -l.knee.position.y, lower: m.lower, radius: m.radius, top: l.hip.position.y };
}

export function measureRig(rig) {
  const j = rig.joints;
  rig.ground = { pelvis: j.pelvis, L: leg(j.legL, rig.params.leg), R: leg(j.legR, rig.params.leg) };
  return rig;
}

// the bottom of one foot, in the figure's own frame (y up from its origin)
function drop(g, l) {
  const h = l.hip.rotation.x;
  return g.pelvis.position.y + l.top - l.upper * Math.cos(h) - l.lower * Math.cos(h + l.knee.rotation.x) - l.radius;
}

// Sit a rig down: thighs forward, shins down, feet on the floor at `floorY`
// (so the seat it reads as sitting on is about a shin's length up). Call it
// after anything that poses the legs, every frame it is to stay seated.
export function sitRig(rig, floorY) {
  const j = rig.joints;
  j.legL.hip.rotation.x = j.legR.hip.rotation.x = -1.45;
  j.legL.knee.rotation.x = j.legR.knee.rotation.x = 1.5;
  j.torso.rotation.x = 0.1;
  return standRig(rig, floorY);
}

export function standRig(rig, floorY) {
  const g = rig.ground || measureRig(rig).ground;
  const low = Math.min(drop(g, g.L), drop(g, g.R));
  rig.group.position.y = floorY - low * rig.group.scale.y;
  return rig.group.position.y;
}

export function footY(rig) {
  const g = rig.ground || measureRig(rig).ground;
  return rig.group.position.y + Math.min(drop(g, g.L), drop(g, g.R)) * rig.group.scale.y;
}
