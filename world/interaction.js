/**
 * ============================================================
 * SHARED INTERACTION CONTRACT — copy verbatim into aliens.js and creatures.js
 * ============================================================
 *
 * @typedef {Object} DialoguePayload
 * @property {{name: string, species: string, cityId: (string|null)}} speaker
 * @property {string[]} lines
 * @property {Quest} [offer]
 *
 * @typedef {
 *   {kind: 'codex', subject: string} |
 *   {kind: 'waypoint', targetHint: string, marker: THREE.Vector3} |
 *   {kind: 'choice', prompt: string, options: {label: string, outcomeTag: string}[]}
 * } Quest
 *
 * Contract:
 * - nearestInteractable(playerPos: THREE.Vector3, maxDist: number) => Entity|null
 *   Scans this module's active rig pool ONLY (not impostors). No per-call allocation:
 *   reuse a module-scoped scratch Vector3/scalar for distance checks.
 * - interact(entity: Entity) => DialoguePayload
 *   Pure content assembly from entity.seed + culture/species profile. May allocate
 *   (called on user action, not per frame). Must not retain external refs past dispose().
 * - endInteract(entity: Entity) => void
 *   Host signals that the dialogue tied to this entity has closed (player advanced
 *   past the last line, walked away, or boarded the ship). The module releases its
 *   internal talk/gesture state; the host still never drives pose logic directly.
 *   Must be safe to call twice and with a stale entity.
 * - Quest.marker is a THREE.Vector3 in THIS MODULE'S group-local space — the same
 *   frame update() receives playerPos in. The host parents any marker visual under
 *   the module's group so planet spin / origin rebases carry it.
 * - Host owns quest/codex/consequence state. This module NEVER mutates global state,
 *   only returns data describing intent.
 * - Both modules trigger talk/gesture pose internally in update() while a dialogue
 *   tied to that entity is open; host never calls into pose logic directly.
 * ============================================================
 */