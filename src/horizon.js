// The chapter past the horizon (GDD 5.7.7): its host.
//
// It builds the chapter's places the first time each is wanted and maps the
// chapter's doors (`hz:*`) to them, as src/homebase.js does for the light
// ship's rooms. What the places are and what happens in them is the chapter's
// own (the SEALED files it reads).
//
// ctx: { scene, camera, chapter, hideFleet(), openSpace() -> the door onto the
// home base's bridge }

export function createHorizon(ctx) {
  void ctx;
  return {
    // a door key -> { site, spawn, yaw, look } | null
    hop: () => null,
    // a door of the chapter's has just been walked through (asking clears it)
    door: () => null,
    // the door a game come back to in the middle of the chapter goes in by
    resume: () => null,
    update() {},
    onReset() {},
    state: () => ({ built: [] }),
  };
}
