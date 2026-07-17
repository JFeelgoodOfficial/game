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
 * - Host owns quest/codex/consequence state. This module NEVER mutates global state,
 *   only returns data describing intent.
 * - Both modules trigger talk/gesture pose internally in update() while a dialogue
 *   tied to that entity is open; host never calls into pose logic directly.
 * ============================================================
 */