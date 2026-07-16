import * as THREE from 'three';
import { Astronaut, type MoveMode } from './astronaut';
import { createTerrain, createWater, createBackdropPeaks, terrainHeight, waterDepth, WORLD_RADIUS, WATER_LEVEL } from './terrain';
import { createGrass, createTrees, createRocks, createShrubs } from './vegetation';
import { createSky, createClouds } from './sky';
import { LITE, SHADOWS, PIXEL_RATIO_CAP } from './config';

export interface HudState {
  mode: MoveMode;
  locked: boolean;
  sprinting: boolean;
  heading: number; // degrees 0-360
  speedKmh: number;
  ready: boolean;
}

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private astronaut = new Astronaut();
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  // updatables
  private waterUpdate: (t: number) => void = () => {};
  private grassUpdate: (t: number) => void = () => {};
  private cloudUpdate: (dt: number) => void = () => {};
  private shadowFollow: (p: THREE.Vector3) => void = () => {};

  // input
  private keys = new Set<string>();
  private yaw = Math.atan2(58, 30);
  private pitch = 0.38;
  private camDist = 7.6;

  // player physics
  private pos = new THREE.Vector3(0, 0, 0);
  private vel = new THREE.Vector3();
  private vy = 0;
  private grounded = true;
  private heading = Math.atan2(58, 30);
  private mode: MoveMode = 'idle';

  private lastHud = '';
  private canvas: HTMLCanvasElement;
  private onHud: (h: HudState) => void;

  constructor(canvas: HTMLCanvasElement, onHud: (h: HudState) => void) {
    this.canvas = canvas;
    this.onHud = onHud;
    const shot = new URLSearchParams(window.location.search).has('shot');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, preserveDrawingBuffer: LITE || shot });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = SHADOWS;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4200);

    this.buildWorld();

    // spawn on dry ground facing the pond
    this.pos.set(0, terrainHeight(0, 0), 0);

    this.bindInput();
    this.clock.start();
    this.loop();

    window.addEventListener('resize', this.handleResize);
  }

  private buildWorld(): void {
    const skyRig = createSky(this.scene, this.renderer);
    this.shadowFollow = skyRig.updateShadowTarget;
    createTerrain(this.scene);
    this.waterUpdate = createWater(this.scene).update;
    createBackdropPeaks(this.scene);
    this.cloudUpdate = createClouds(this.scene).update;
    this.grassUpdate = createGrass(this.scene).update;
    createTrees(this.scene);
    createShrubs(this.scene);
    createRocks(this.scene);
    this.scene.add(this.astronaut.group);
  }

  // -------------------------------------------------------------------------
  private handleResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * 0.0023;
    this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.0021, -0.18, 1.25);
  };

  private onWheel = (e: WheelEvent) => {
    this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.004, 4.5, 13);
  };

  private onClick = () => {
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  };

  private onLockChange = () => this.pushHud(true);

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel);
    this.canvas.addEventListener('click', this.onClick);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  // -------------------------------------------------------------------------
  private updatePlayer(dt: number): void {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');

    const depth = waterDepth(this.pos.x, this.pos.z);
    const swimming = depth > 1.35 && this.pos.y <= WATER_LEVEL + 0.05;
    const wading = !swimming && depth > 0.22;

    // camera-relative wish direction
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const wish = new THREE.Vector3(
      sinY * fwd + cosY * str,
      0,
      cosY * fwd - sinY * str,
    );
    if (wish.lengthSq() > 1) wish.normalize();
    const moving = wish.lengthSq() > 0.001;

    let targetSpeed = 0;
    if (moving) {
      targetSpeed = swimming ? 3.4 : wading ? 3.6 : sprint ? 10.2 : 6.0;
    }

    // horizontal velocity with acceleration/friction
    const accel = swimming ? 10 : this.grounded ? 42 : 9;
    const targetVel = wish.clone().multiplyScalar(targetSpeed);
    this.vel.x += (targetVel.x - this.vel.x) * Math.min(1, accel * dt / Math.max(1, targetSpeed));
    this.vel.z += (targetVel.z - this.vel.z) * Math.min(1, accel * dt / Math.max(1, targetSpeed));

    if (swimming) {
      // buoyancy — ride the surface
      this.vy = 0;
      this.pos.y += ((WATER_LEVEL - 0.55) - this.pos.y) * Math.min(1, 6 * dt);
      this.grounded = false;
      // allow hopping out near shore
      if (k.has('Space') && depth < 2.2) {
        this.vy = 6.5;
        this.pos.y += this.vy * dt;
      }
    } else {
      this.vy -= 24 * dt;
      if (k.has('Space') && this.grounded) {
        this.vy = 9.2;
        this.grounded = false;
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vy * dt;

    // world boundary — gentle push back toward the valley
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD_RADIUS) {
      const push = (r - WORLD_RADIUS) * 2.2;
      this.pos.x -= (this.pos.x / r) * push * dt;
      this.pos.z -= (this.pos.z / r) * push * dt;
    }

    // ground collision
    const ground = terrainHeight(this.pos.x, this.pos.z);
    if (!swimming && this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.05) {
      this.grounded = false;
    }

    // heading follows velocity
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.4) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, 12 * dt);
    }

    // resolve mode
    const nowSwimming = waterDepth(this.pos.x, this.pos.z) > 1.35 && this.pos.y <= WATER_LEVEL + 0.02;
    if (nowSwimming) this.mode = 'swim';
    else if (!this.grounded) this.mode = 'jump';
    else if (hSpeed > 0.6) this.mode = 'run';
    else this.mode = 'idle';

    // apply to rig
    this.astronaut.group.position.copy(this.pos);
    this.astronaut.group.rotation.y = this.heading;
    this.astronaut.update(dt, this.mode, THREE.MathUtils.clamp(hSpeed / 10.2, 0, 1));

    // FOV kick when sprinting
    const wantFov = sprint && hSpeed > 7 ? 69 : 62;
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number): void {
    const swimming = this.mode === 'swim';
    const eyeH = swimming ? 1.15 : 1.72;
    const target = new THREE.Vector3(this.pos.x, this.pos.y + eyeH, this.pos.z);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // behind the astronaut, raised by pitch
    const offset = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const desired = target.clone().addScaledVector(offset, this.camDist);

    // keep camera above terrain & water
    const minY = Math.max(terrainHeight(desired.x, desired.z) + 1.15, WATER_LEVEL + 0.4);
    if (desired.y < minY) desired.y = minY;

    const smooth = 1 - Math.exp(-9 * dt);
    this.camera.position.lerp(desired, smooth);
    this.camera.lookAt(target);
  }

  private pushHud(force = false): void {
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const h: HudState = {
      mode: this.mode,
      locked: document.pointerLockElement === this.canvas,
      sprinting: (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && hSpeed > 6.5,
      heading: ((THREE.MathUtils.radToDeg(-this.heading) % 360) + 360) % 360,
      speedKmh: hSpeed * 3.6,
      ready: true,
    };
    const sig = `${h.mode}|${h.locked}|${h.sprinting}|${Math.round(h.heading / 3)}|${Math.round(h.speedKmh)}|${h.ready}`;
    if (force || sig !== this.lastHud) {
      this.lastHud = sig;
      this.onHud(h);
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.25);
    const t = this.clock.elapsedTime;

    // sub-step physics so gameplay speed stays real even at low frame rates
    const steps = Math.max(1, Math.ceil(dt / 0.05));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) this.updatePlayer(sdt);
    this.updateCamera(dt);

    this.waterUpdate(t);
    this.grassUpdate(t);
    this.cloudUpdate(dt);
    this.shadowFollow(this.pos);

    this.renderer.render(this.scene, this.camera);
    this.pushHud();
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }
}
