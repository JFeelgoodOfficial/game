import { useEffect, useRef, useState } from 'react';
import { GameEngine, type HudState } from '../game/engine';
import '../App.css';

const MODE_LABEL: Record<string, { label: string; color: string }> = {
  idle: { label: 'Standing', color: '#9fd6a8' },
  run: { label: 'Running', color: '#f0c65c' },
  jump: { label: 'Airborne', color: '#8ecbf2' },
  swim: { label: 'Swimming', color: '#6fd8d2' },
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<HudState>({
    mode: 'idle', locked: false, sprinting: false, heading: 0, speedKmh: 0, ready: false,
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, setHud);
    return () => engine.dispose();
  }, []);

  const mode = MODE_LABEL[hud.mode] ?? MODE_LABEL.idle;
  const compassIdx = Math.round(hud.heading / 45) % 8;

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="hud-vignette" />

      {/* top-left mission tag */}
      <div className="hud-panel absolute left-5 top-5 px-4 py-3 text-[#f3e3b3]">
        <div className="text-[10px] tracking-[0.3em] text-[#d9b13b]/80 font-semibold">TERRA NOVA // EXPEDITION 07</div>
        <div className="mt-1 text-lg font-semibold tracking-wide text-[#f7ecd0]">Golden Basin</div>
        <div className="text-[11px] text-[#d9c9a0]/70">Uncharted wilderness &middot; Sol 12 &middot; 14:26 Local</div>
      </div>

      {/* compass */}
      <div className="hud-panel absolute left-1/2 top-5 -translate-x-1/2 px-5 py-2 text-center">
        <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.2em]">
          {[-2, -1, 0, 1, 2].map((o) => {
            const i = ((compassIdx + o) % 8 + 8) % 8;
            const active = o === 0;
            return (
              <span
                key={o}
                style={{
                  color: active ? '#f0c65c' : 'rgba(243,227,179,0.4)',
                  fontSize: active ? '0.95rem' : '0.7rem',
                  transform: active ? 'scale(1.15)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {COMPASS[i]}
              </span>
            );
          })}
        </div>
      </div>

      {/* bottom-left vitals / movement state */}
      <div className="hud-panel absolute bottom-6 left-5 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: mode.color, boxShadow: `0 0 10px ${mode.color}`, animation: hud.mode !== 'idle' ? 'pulseGlow 1.2s infinite' : 'none' }}
          />
          <span className="hud-chip text-sm font-bold" style={{ color: mode.color }}>{mode.label}</span>
          {hud.sprinting && <span className="hud-chip text-[10px] font-semibold text-[#f0c65c]/80">Sprint</span>}
        </div>
        <div className="mt-1.5 flex gap-4 text-[10px] tracking-widest text-[#d9c9a0]/70">
          <span>V {hud.speedKmh.toFixed(1)} KM/H</span>
          <span>O2 98%</span>
          <span>SUIT NOMINAL</span>
        </div>
      </div>

      {/* bottom-right controls */}
      <div className="hud-panel absolute bottom-6 right-5 px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2 text-[11px] text-[#d9c9a0]/85">
          <span className="key-cap">W</span><span className="key-cap">A</span><span className="key-cap">S</span><span className="key-cap">D</span>
          <span className="ml-1">move</span>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-[#d9c9a0]/85">
          <span className="key-cap">SHIFT</span><span>sprint</span>
          <span className="key-cap ml-2">SPACE</span><span>jump</span>
        </div>
        <div className="mt-2 text-[10px] tracking-wider text-[#d9c9a0]/55">walk into the pond to swim &middot; scroll to zoom</div>
      </div>

      {/* start overlay */}
      <div className={`start-overlay ${hud.locked ? 'hidden' : ''}`}>
        <div className="text-[11px] tracking-[0.5em] text-[#d9b13b] font-semibold">A THIRD-PERSON WILDERNESS EXPLORER</div>
        <h1 className="mt-4 text-6xl font-black tracking-[0.12em] text-[#f7ecd0]" style={{ textShadow: '0 0 40px rgba(217,177,59,0.35)' }}>
          TERRA NOVA
        </h1>
        <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-[#d9c9a0]/80">
          A lone astronaut. An untouched world. Golden grass, cold ponds,
          and snow-capped giants on the horizon.
        </p>
        <div className="mt-8 flex items-center gap-6 text-xs text-[#d9c9a0]">
          <div className="flex items-center gap-2"><span className="key-cap">WASD</span> Move</div>
          <div className="flex items-center gap-2"><span className="key-cap">SHIFT</span> Sprint</div>
          <div className="flex items-center gap-2"><span className="key-cap">SPACE</span> Jump</div>
          <div className="flex items-center gap-2"><span className="key-cap">MOUSE</span> Look</div>
        </div>
        <div className="mt-10 animate-pulse rounded-full border border-[#d9b13b]/50 px-8 py-3 text-sm font-semibold tracking-[0.25em] text-[#f0c65c]">
          CLICK TO BEGIN EXPLORING
        </div>
      </div>
    </div>
  );
}
