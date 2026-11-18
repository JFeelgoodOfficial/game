// Feet on the floor, for the figures world/aliens.js builds (GDD 5.7.4).
//
// buildRig() gives each figure a `groundOffset` that is an estimate: it does
// not know how long that figure's legs are, and it does not move as they
// swing, so a figure placed by it stands in the air or in the floor and its
// feet leave the ground in the middle of every stride.
//
// Here the legs are measured once (the lengths are in the rig's own joints),
// and then each frame, after the pose has been set, the lower of the two feet
// is worked out from the hip and knee angles and the figure is put so that
// that foot is on the floor. The stance foot is planted; the body rides up
// and down over it, as a walker's does. Two cosines a leg, no matrices, no
// allocation.
//
//   measureRig(rig)            once, after buildRig
//   standRig(rig, floorY)      every frame, after poseRig; returns the y it set
//   footY(rig)                 where the lower foot is now (for checks)

function leg(l) {
  const upper = -l.knee.position.y; // hip to knee
  const shin = l.knee.children[0]; // the lower leg's capsule, hung from the knee
  const lower = shin ? -shin.position.y * 2 : upper;
  const radius = shin && shin.geometry.parameters ? shin.geometry.parameters.radius || 0 : 0;
  return { hip: l.hip, knee: l.knee, upper, lower, radius, top: l.hip.position.y };
}

export function measureRig(rig) {
  const j = rig.joints;
  rig.ground = { pelvis: j.pelvis, L: leg(j.legL), R: leg(j.legR) };
  return rig;
}

// the bottom of one foot, in the figure's own frame (y up from its origin)
function drop(g, l) {
  const h = l.hip.rotation.x;
  return g.pelvis.position.y + l.top - l.upper * Math.cos(h) - l.lower * Math.cos(h + l.knee.rotation.x) - l.radius;
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
