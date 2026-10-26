import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine, type GameState, type GameStatus, type ViewMode } from "./game/engine";
import { Render2D } from "./game/render2d";
import { Scene3D } from "./game/scene3d";
import { AudioEngine } from "./game/audio";
import { HologramHud } from "./components/HologramHud";
import type { HandDirection } from "./game/handTracking";
import {
  ArrowIcon,
  BoltIcon,
  ChevronIcon,
  CubeIcon,
  EyeIcon,
  GhostGlyph,
  GridIcon,
  HandIcon,
  HelpIcon,
  Kbd,
  LiveDot,
  MuteIcon,
  PacMark,
  PanelTitle,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  SkullIcon,
  SparkIcon,
  TargetIcon,
  Toggle,
  VolumeIcon,
} from "./components/ui";

type BaseView = "2d" | "3d";

interface GhostInfo {
  id: number;
  name: string;
  role: string;
  color: string;
  mode: "house" | "out" | "eaten";
  frightened: boolean;
}

interface Hud {
  status: GameStatus;
  score: number;
  high: number;
  lives: number;
  level: number;
  pellets: number;
  totalPellets: number;
  danger: number;
  threat: number;
  nearest: number;
  powerTimer: number;
  phase: "scatter" | "chase";
  ghosts: GhostInfo[];
  lastGhost: string;
  pacDir: string | null;
  nearestGhost: { name: string; color: string; distance: number; relX: number; relY: number } | null;
}

const EMPTY_HUD: Hud = {
  status: "idle",
  score: 0,
  high: 0,
  lives: 3,
  level: 1,
  pellets: 0,
  totalPellets: 1,
  danger: 0,
  threat: 30,
  nearest: 30,
  powerTimer: 0,
  phase: "scatter",
  ghosts: [
    { id: 0, name: "BLINK", role: "THE STALKER", color: "#ff3358", mode: "out", frightened: false },
    { id: 1, name: "VEX", role: "THE AMBUSHER", color: "#ff63d8", mode: "house", frightened: false },
    { id: 2, name: "WRAITH", role: "THE FLANKER", color: "#2ee6ff", mode: "house", frightened: false },
    { id: 3, name: "HEX", role: "THE WILDCARD", color: "#ffab35", mode: "house", frightened: false },
  ],
  lastGhost: "",
  pacDir: null,
  nearestGhost: null,
};

const snapshot = (s: GameState): Hud => {
  const out = s.ghosts
    .filter((g) => g.mode === "out")
    .map((g) => ({
      name: g.name,
      color: g.color,
      distance: Math.hypot(s.pac.tile.x - g.tile.x, s.pac.tile.y - g.tile.y),
      relX: g.tile.x - s.pac.tile.x,
      relY: g.tile.y - s.pac.tile.y,
    }))
    .sort((a, b) => a.distance - b.distance);
  return {
    status: s.status,
    score: s.score,
    high: s.high,
    lives: s.lives,
    level: s.level,
    pellets: s.pellets.size,
    totalPellets: s.totalPellets,
    danger: s.danger,
    threat: s.threat,
    nearest: s.nearest,
    powerTimer: s.powerTimer,
    phase: s.mode,
    ghosts: s.ghosts.map((g) => ({
      id: g.id,
      name: g.name,
      role: g.role,
      color: g.color,
      mode: g.mode,
      frightened: g.frightened,
    })),
    lastGhost: s.lastGhost,
    pacDir: s.pac.dir,
    nearestGhost: out[0] ?? null,
  };
};

const fmt = (n: number) => n.toLocaleString("en-US");

const threatMeta = (threat: number, powered: boolean) => {
  if (powered) return { label: "VULNERABLE", color: "#ffd83d", bg: "rgba(255,216,61,.12)" };
  if (threat < 2.8) return { label: "CRITICAL", color: "#ff3b5c", bg: "rgba(255,59,92,.14)" };
  if (threat < 4.5) return { label: "IMMINENT", color: "#ffa02e", bg: "rgba(255,160,46,.12)" };
  if (threat < 8) return { label: "TRACKING", color: "#56e8ff", bg: "rgba(86,232,255,.1)" };
  return { label: "CLEAR", color: "#4dfbc4", bg: "rgba(77,251,196,.1)" };
};

const ghostState = (g: GhostInfo, threat: number) => {
  if (g.mode === "house") return { label: "DORMANT", color: "#8d86a8" };
  if (g.mode === "eaten") return { label: "RECALLED", color: "#c39bff" };
  if (g.frightened) return { label: "VULNERABLE", color: "#7d8cff" };
  if (threat < 3)
    return { label: "LOCKED ON", color: "#ff3b5c" };
  return { label: "HUNTING", color: g.color };
};

function StatBlock({ label, value, accent, dim }: { label: string; value: string; accent?: boolean; dim?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`font-mono text-[8.5px] font-semibold uppercase tracking-[0.2em] ${dim ? "text-white/30" : "text-white/40"}`}>
        {label}
      </div>
      <div
        className={`font-display text-[15px] font-bold leading-tight tabular-nums sm:text-[17px] ${
          accent ? "text-[#ffe067]" : "text-white/90"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function App() {
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [view, setView] = useState<BaseView>("3d");
  const [autoPov, setAutoPov] = useState(true);
  const [forcePov, setForcePov] = useState(false);
  const [muted, setMuted] = useState(false);
  const [povLive, setPovLive] = useState(false);
  const [threeFailed, setThreeFailed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [gestureEnabled, setGestureEnabled] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const sceneHostRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const povResetRef = useRef(0);
  const engineRef = useRef<GameEngine | null>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const renderer2dRef = useRef<Render2D | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const sceneOkRef = useRef(false);
  const configRef = useRef({ view, autoPov, forcePov });
  const mutedRef = useRef(muted);

  useEffect(() => {
    configRef.current = { view, autoPov, forcePov };
  }, [view, autoPov, forcePov]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const resumeAfterHelpRef = useRef(false);

  // Reading the manual should never get Pac-Man eaten.
  useEffect(() => {
    const engine = engineRef.current;
    if (helpOpen) {
      if (engine?.state.status === "playing") {
        engine.togglePause();
        resumeAfterHelpRef.current = true;
        setHud(snapshot(engine.state));
      }
    } else if (resumeAfterHelpRef.current) {
      resumeAfterHelpRef.current = false;
      if (engine?.state.status === "paused") {
        engine.togglePause();
        setHud(snapshot(engine.state));
      }
    }
  }, [helpOpen]);

  const ensureAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.ensure();
    audio.setMuted(mutedRef.current);
    audio.startSiren();
  }, []);

  const startGame = useCallback(() => {
    ensureAudio();
    engineRef.current?.start();
    povResetRef.current += 1;
    setForcePov(false);
    setPovLive(false);
    if (engineRef.current) setHud(snapshot(engineRef.current.state));
  }, [ensureAudio]);

  const restartGame = useCallback(() => {
    ensureAudio();
    engineRef.current?.restart();
    povResetRef.current += 1;
    setForcePov(false);
    setPovLive(false);
    if (engineRef.current) setHud(snapshot(engineRef.current.state));
  }, [ensureAudio]);

  const togglePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.state.status === "idle" || engine.state.status === "gameover") {
      startGame();
      return;
    }
    engine.togglePause();
    setHud(snapshot(engine.state));
  }, [startGame]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      if (!next) {
        audioRef.current?.ensure();
        if (engineRef.current?.state.status === "playing") audioRef.current?.startSiren();
      }
      return next;
    });
  }, []);

  const togglePov = useCallback(() => {
    if (threeFailed) return;
    if (povLive && !forcePov) {
      // Facing a panic moment? Give the player an explicit escape hatch.
      configRef.current.autoPov = false;
      setAutoPov(false);
      setPovLive(false);
      return;
    }
    setForcePov((v) => !v);
  }, [forcePov, povLive, threeFailed]);

  const handleDirection = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      const engine = engineRef.current;
      if (!engine) return;
      if (engine.state.status === "idle" || engine.state.status === "gameover") startGame();
      engine.setDirection(dir);
    },
    [startGame]
  );

  const handleGestureAction = useCallback(
    (action: "pause" | "pov" | "restart") => {
      if (action === "pause") togglePause();
      else if (action === "pov") togglePov();
      else if (action === "restart") restartGame();
    },
    [togglePause, togglePov, restartGame]
  );

  // Main game loop
  useEffect(() => {
    const engine = new GameEngine();
    const audio = new AudioEngine();
    engineRef.current = engine;
    audioRef.current = audio;
    setHud(snapshot(engine.state));

    let scene: Scene3D | null = null;
    if (sceneHostRef.current) {
      scene = new Scene3D(sceneHostRef.current);
      sceneRef.current = scene;
      sceneOkRef.current = scene.ok;
      if (!scene.ok) {
        setThreeFailed(true);
        setView("2d");
      }
    }

    let renderer2d: Render2D | null = null;
    if (canvas2dRef.current) {
      renderer2d = new Render2D(canvas2dRef.current);
      renderer2dRef.current = renderer2d;
    }

    let raf = 0;
    let last = performance.now();
    let lastHudAt = 0;
    let lastHeart = 0;
    let prevStatus = engine.state.status;
    let lastPov = false;
    let povHold = false;
    let releaseClock = 0;
    let lastReset = povResetRef.current;
    let lastEffective: ViewMode | "" = "";
    let lastW = 0;
    let lastH = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const cfg = configRef.current;
      const state = engine.state;

      engine.step(dt);
      const events = engine.drainEvents();
      events.forEach((event) => audio.play(event));

      if (povResetRef.current !== lastReset) {
        lastReset = povResetRef.current;
        povHold = false;
        releaseClock = 0;
        if (lastPov) {
          lastPov = false;
          setPovLive(false);
        }
      }

      // Automatic panic camera: drop into Pac's eyes as a specter closes in.
      if (cfg.autoPov && sceneOkRef.current) {
        if (state.status === "playing" && state.threat < 2.8) {
          povHold = true;
          releaseClock = 0;
        } else if (povHold) {
          releaseClock += dt;
          const safe = state.threat > 3.9 && state.status === "playing";
          const ended = state.status === "idle" || state.status === "gameover";
          if ((safe && releaseClock > 0.55) || ended) {
            povHold = false;
            releaseClock = 0;
          }
        }
      } else {
        povHold = false;
        releaseClock = 0;
      }

      if (povHold !== lastPov) {
        lastPov = povHold;
        setPovLive(povHold);
        if (povHold) audio.heartbeat(0.9);
      }

      const dyingPov = state.status === "dying" && (cfg.view === "3d" || cfg.autoPov);
      const wantPov = cfg.forcePov || povHold || dyingPov;
      const effective: ViewMode =
        wantPov && sceneOkRef.current ? "pov" : cfg.view === "3d" && sceneOkRef.current ? "3d" : "2d";

      const stage = stageRef.current;
      if (stage && renderer2d) {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (w !== lastW || h !== lastH) {
          lastW = w;
          lastH = h;
          renderer2d.resize(w, h);
          scene?.resize(w, h);
        }
      }

      if (sceneHostRef.current) {
        const show3d = effective !== "2d";
        sceneHostRef.current.style.opacity = show3d ? "1" : "0";
        sceneHostRef.current.style.pointerEvents = show3d ? "auto" : "none";
      }
      if (canvas2dRef.current) {
        const show2d = effective === "2d";
        canvas2dRef.current.style.opacity = show2d ? "1" : "0";
        canvas2dRef.current.style.pointerEvents = "none";
      }

      if (effective !== lastEffective) {
        lastEffective = effective;
      }

      if (effective === "2d" && renderer2d) {
        renderer2d.draw(state, now / 1000, dt);
      } else if (scene?.ok) {
        scene.update(state, effective === "pov" ? "pov" : "orbit", now / 1000, dt);
      }

      audio.setDanger(state.danger, state.status === "playing");
      if (
        (povHold || cfg.forcePov) &&
        state.status === "playing" &&
        state.danger > 0.25 &&
        now - lastHeart > 1000 - state.danger * 460
      ) {
        lastHeart = now;
        audio.heartbeat(0.35 + state.danger * 0.65);
      }

      if (now - lastHudAt > 100 || state.status !== prevStatus) {
        lastHudAt = now;
        prevStatus = state.status;
        setHud(snapshot(state));
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      scene?.dispose();
      audio.dispose();
      engineRef.current = null;
      sceneRef.current = null;
      renderer2dRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const engine = engineRef.current;
      if (!engine) return;
      const key = e.key.toLowerCase();
      if (helpOpen && key !== "escape" && key !== "?" && key !== "h") return;
      const dirs: Record<string, "up" | "down" | "left" | "right"> = {
        arrowup: "up",
        w: "up",
        arrowdown: "down",
        s: "down",
        arrowleft: "left",
        a: "left",
        arrowright: "right",
        d: "right",
      };
      if (dirs[key]) {
        e.preventDefault();
        handleDirection(dirs[key]);
        return;
      }
      if (key === " ") {
        e.preventDefault();
        togglePause();
      } else if (key === "v") {
        setView((v) => (threeFailed ? "2d" : v === "2d" ? "3d" : "2d"));
      } else if (key === "p") {
        togglePov();
      } else if (key === "g") {
        setGestureEnabled((v) => !v);
      } else if (key === "m") {
        toggleMute();
      } else if (key === "r") {
        restartGame();
      } else if (key === "?" || key === "h") {
        setHelpOpen((v) => !v);
      } else if (key === "escape") {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDirection, helpOpen, restartGame, threeFailed, toggleMute, togglePause, togglePov]);

  const activeView: ViewMode = forcePov || povLive ? "pov" : view;
  const panic = activeView === "pov";
  const powered = hud.powerTimer > 0;
  const threat = threatMeta(hud.threat, powered);
  const pelletsEaten = hud.totalPellets - hud.pellets;
  const pelletPct = hud.totalPellets > 0 ? Math.min(100, (pelletsEaten / hud.totalPellets) * 100) : 0;
  const threatPct = Math.min(100, Math.max(3, hud.danger * 100));
  const threatDisplay = hud.threat > 12 ? "—" : hud.threat.toFixed(1);
  const statusLabel =
    hud.status === "playing"
      ? "IN GAME"
      : hud.status === "paused"
        ? "PAUSED"
        : hud.status === "gameover"
          ? "SIGNAL LOST"
          : hud.status === "dying"
            ? "CONTACT"
            : "STANDBY";
  const nearest = hud.nearestGhost;

  const changeView = (next: BaseView) => {
    if (next === "3d" && threeFailed) return;
    setView(next);
    if (next === "2d") setForcePov(false);
  };

  const headerPlay = () => {
    if (hud.status === "idle" || hud.status === "gameover") startGame();
    else if (hud.status === "paused") togglePause();
    else document.getElementById("arena")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const nearestTiles = nearest ? nearest.distance.toFixed(1) : threatDisplay;
  const forwardVec =
    hud.pacDir === "up"
      ? { x: 0, y: -1 }
      : hud.pacDir === "down"
        ? { x: 0, y: 1 }
        : hud.pacDir === "left"
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 };
  const rightVec = { x: -forwardVec.y, y: forwardVec.x };
  const relX = nearest?.relX ?? 0;
  const relY = nearest?.relY ?? 0;
  const bearing = Math.round(
    (Math.atan2(relX * rightVec.x + relY * rightVec.y, relX * forwardVec.x + relY * forwardVec.y) * 180) / Math.PI
  );
  const threatBehind = Math.abs(bearing) > 130;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06040f] text-white">
      {/* ambient light field */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-[520px] w-[520px] rounded-full bg-[#5b2bff]/20 blur-[130px]" />
        <div className="absolute -right-32 top-24 h-[420px] w-[420px] rounded-full bg-[#ff3d8b]/12 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[620px] rounded-full bg-[#12d6ff]/8 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(124,107,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(124,107,255,.16) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse at 50% 0%, black 10%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, black 10%, transparent 70%)",
          }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#06040f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#arena" className="flex items-center gap-3 focus-ring rounded-xl">
            <div className="relative grid h-11 w-11 place-items-center rounded-2xl border border-[#ffd83d]/25 bg-[#ffd83d]/[0.08] p-1.5 shadow-[0_0_30px_-8px_rgba(255,216,61,0.6)]">
              <PacMark className="h-full w-full" />
            </div>
            <div>
              <div className="font-display text-[17px] font-bold leading-none tracking-[0.13em] sm:text-lg">
                NEON<span className="text-[#ffd83d]">CHOMP</span>
              </div>
              <div className="mt-1 font-mono text-[8px] font-medium uppercase tracking-[0.32em] text-white/35">
                Pac-Man · Phantom Arcade
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-1 md:flex">
            <a href="#arena" className="rounded-lg px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.05] hover:text-white">
              Play
            </a>
            <a href="#ghost-files" className="rounded-lg px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50 transition hover:bg-white/[0.05] hover:text-white">
              Ghost files
            </a>
            <button
              onClick={() => setHelpOpen(true)}
              className="rounded-lg px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50 transition hover:bg-white/[0.05] hover:text-white"
            >
              How to play
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 lg:flex">
              <LiveDot color={hud.status === "gameover" ? "#ff3b5c" : "#4dfbc4"} label={statusLabel} />
            </div>
            <button
              onClick={() => setGestureEnabled((v) => !v)}
              aria-label={gestureEnabled ? "Disable Iron Man gestures" : "Enable Iron Man gestures"}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 transition focus-ring ${
                gestureEnabled
                  ? "border-[#00d4ff]/60 bg-[#00d4ff]/15 text-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.35)]"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:border-[#00d4ff]/40 hover:text-[#00d4ff]"
              }`}
              title="Toggle Iron Man Hand Tracking (G)"
            >
              <HandIcon className="h-4 w-4" />
              <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.14em] sm:inline">
                {gestureEnabled ? "IRON MAN ON" : "GESTURE"}
              </span>
            </button>
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute game" : "Mute game"}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 transition hover:border-white/20 hover:text-white focus-ring"
            >
              {muted ? <MuteIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setHelpOpen(true)}
              aria-label="How to play"
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 transition hover:border-white/20 hover:text-white focus-ring"
            >
              <HelpIcon className="h-4 w-4" />
            </button>
            <button onClick={headerPlay} className="arcade-btn btn-primary focus-ring ml-1 hidden h-9 px-4 text-[10px] sm:inline-flex">
              {hud.status === "idle"
                ? "Insert coin"
                : hud.status === "paused"
                  ? "Resume"
                  : hud.status === "gameover"
                    ? "Run it again"
                    : "To arena"}
              <PlayIcon className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* live ticker */}
      <div className="relative z-10 overflow-hidden border-b border-white/[0.05] bg-white/[0.014] py-2">
        <div className="ticker flex w-max items-center gap-10 font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-white/35">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-10">
              <span className="flex items-center gap-2 text-[#ffd83d]/80">
                <span className="h-1 w-1 rounded-full bg-[#ffd83d]" /> Live from sector 07
              </span>
              <span>The specters are hungry</span>
              <span className="text-[#56e8ff]/60">Auto-panic camera armed</span>
              <span>Power cores restore courage</span>
              <span className="text-[#ff5fa2]/70">Do not look back</span>
              <span>High score — {fmt(Math.max(hud.high, hud.score))}</span>
            </div>
          ))}
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-[1480px] px-4 pb-14 pt-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="chip border-[#ffd83d]/25 bg-[#ffd83d]/10 text-[#ffe167]">
                <SparkIcon className="h-3 w-3" /> Pac-Man // Night shift
              </span>
              <span className="chip hidden sm:inline-flex">60 fps arena</span>
            </div>
            <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight sm:text-4xl">
              THE MAZE IS <span className="text-[#ffd83d] text-glow-yellow">HUNGRY.</span>
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/45">
              Classic chomp physics, rebuilt for the night shift. Flip between the neon grid and a fully 3D maze —
              and when a specter gets close, the camera drops straight into Pac-Man&apos;s eyes.
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="chip">
              <CubeIcon className="h-3 w-3 text-[#56e8ff]" /> 3D anytime
            </span>
            <span className="chip">
              <EyeIcon className="h-3 w-3 text-[#ff5fa2]" /> Auto POV
            </span>
            <span className="chip">
              <GhostGlyph className="h-3 w-3" /> 4 specters
            </span>
            <span className="chip">
              <HandIcon className="h-3 w-3 text-[#00d4ff]" /> Iron Man Gestures
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <section id="arena" className="min-w-0 scroll-mt-24">
            <div className="glass sheen overflow-hidden rounded-[26px] p-2 sm:p-2.5">
              <div ref={stageRef} className="game-stage scanlines crt-vignette">
                <div
                  ref={sceneHostRef}
                  className="stage-canvas z-0 transition-opacity duration-500"
                  aria-hidden="true"
                />
                <canvas ref={canvas2dRef} className="stage-canvas z-[1] opacity-0 transition-opacity duration-500" aria-label="Neon Chomp game arena" />

                {/* Iron Man Hologram Gesture HUD */}
                <HologramHud
                  enabled={gestureEnabled}
                  onToggle={setGestureEnabled}
                  onDirection={handleDirection}
                  onAction={handleGestureAction}
                />

                {/* subtle red danger wash */}
                {hud.danger > 0.42 && !panic && (
                  <div
                    className="pointer-events-none absolute inset-0 z-[6] transition-opacity"
                    style={{
                      background:
                        "radial-gradient(ellipse at center, transparent 38%, rgba(255,20,70,0.34) 100%)",
                      opacity: Math.min(0.85, hud.danger),
                    }}
                  />
                )}

                {/* panic POV treatment */}
                {panic && <div className="pov-vignette pointer-events-none absolute inset-0 z-[7]" />}
                {panic && <div className="panic-flash pointer-events-none absolute inset-0 z-[11]" />}
                {panic && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[8] h-24 bg-gradient-to-t from-[#ffd83d]/15 via-[#ff5b00]/[0.04] to-transparent" />
                )}

                {/* top HUD */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-4">
                  <div className="glass flex items-center gap-3 rounded-xl px-3 py-2 sm:gap-4 sm:px-4">
                    <StatBlock label="Score" value={fmt(hud.score)} accent />
                    <div className="stat-divider hidden sm:block" />
                    <div className="hidden sm:block">
                      <StatBlock label="High score" value={fmt(Math.max(hud.high, hud.score))} />
                    </div>
                    <div className="stat-divider" />
                    <StatBlock label="Sector" value={String(hud.level).padStart(2, "0")} />
                    <div className="stat-divider" />
                    <div>
                      <div className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.2em] text-white/40">Lives</div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {[0, 1, 2].map((i) => (
                          <PacMark key={i} className={`h-3.5 w-3.5 ${i < hud.lives ? "life-pip" : "opacity-20 grayscale"}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setGestureEnabled((v) => !v)}
                      className={`pointer-events-auto flex h-9 items-center gap-1.5 rounded-xl border px-2.5 backdrop-blur transition ${
                        gestureEnabled
                          ? "border-[#00d4ff]/60 bg-[#00d4ff]/25 text-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.4)]"
                          : "border-white/12 bg-[#0b0819]/80 text-white/70 hover:border-[#00d4ff]/40 hover:text-[#00d4ff]"
                      }`}
                      aria-label={gestureEnabled ? "Disable Iron Man gestures" : "Enable Iron Man gestures"}
                      title={gestureEnabled ? "Disable Gesture Core (Iron Man)" : "Enable Gesture Core (Iron Man)"}
                    >
                      <HandIcon className="h-4 w-4" />
                      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em]">
                        {gestureEnabled ? "IRON MAN" : "GESTURE"}
                      </span>
                    </button>
                    <button
                      onClick={() => changeView(view === "2d" ? "3d" : "2d")}
                      disabled={threeFailed}
                      className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-xl border border-white/12 bg-[#0b0819]/80 px-2.5 text-white/75 backdrop-blur transition hover:border-[#56e8ff]/40 hover:text-[#56e8ff] disabled:opacity-30"
                      aria-label={view === "2d" ? "Switch to 3D view" : "Switch to 2D view"}
                      title={view === "2d" ? "Switch to 3D" : "Switch to 2D"}
                    >
                      {view === "2d" ? <CubeIcon className="h-4 w-4" /> : <GridIcon className="h-4 w-4" />}
                      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.12em]">{view === "2d" ? "3D" : "2D"}</span>
                    </button>
                    <button
                      onClick={togglePov}
                      disabled={threeFailed}
                      className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-xl border backdrop-blur transition disabled:opacity-30 ${
                        panic
                          ? "border-[#ff3b5c]/60 bg-[#ff3b5c]/25 text-[#ff9db0]"
                          : "border-white/12 bg-[#0b0819]/80 text-white/70 hover:border-[#ff5fa2]/40 hover:text-[#ff8fb6]"
                      }`}
                      aria-label={panic ? "Exit first-person POV and disarm auto POV" : "Force first-person POV"}
                      title={panic ? "Exit POV (disarms auto POV)" : "Force first-person POV"}
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={togglePause}
                      className="pointer-events-auto grid h-9 w-9 place-items-center rounded-xl border border-white/12 bg-[#0b0819]/80 text-white/70 backdrop-blur transition hover:border-[#ffd83d]/40 hover:text-[#ffd83d]"
                      aria-label={hud.status === "paused" ? "Resume" : "Pause"}
                    >
                      {hud.status === "paused" ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* panic banner */}
                {panic && (
                  <div className="pointer-events-none absolute inset-x-0 top-[74px] z-20 flex flex-col items-center gap-2 px-4 sm:top-[82px]">
                    <div className="flex items-center gap-2 rounded-full border border-[#ff3b5c]/50 bg-[#1b030a]/85 px-3 py-1.5 shadow-[0_0_30px_-6px_rgba(255,59,92,0.8)] backdrop-blur">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b5c]" />
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-[#ff8fa6]">
                        Panic cam · First-person POV
                      </span>
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#ff8fa6]/60">
                      auto-engaged · threat in corridor
                    </div>
                  </div>
                )}

                {panic && (
                  <div className="pointer-events-none absolute right-3 top-[126px] z-20 sm:right-4">
                    <div className="flex flex-col items-center rounded-xl border border-[#ff3b5c]/25 bg-[#13040b]/80 px-2.5 py-2 backdrop-blur">
                      <span className="font-mono text-[6.5px] font-bold uppercase tracking-[0.18em] text-[#ff8fa6]/60">
                        threat bearing
                      </span>
                      <div className="relative mt-1 grid h-9 w-9 place-items-center rounded-full border border-[#ff3b5c]/30">
                        <span className="absolute inset-1 rounded-full border border-dashed border-[#ff8fa6]/20" />
                        <ArrowIcon
                          dir="up"
                          className="h-4 w-4 text-[#ff8fa6] transition-transform duration-300"
                          style={{ transform: `rotate(${bearing}deg)` }}
                        />
                      </div>
                      <span className="mt-1 font-mono text-[6.5px] font-bold uppercase tracking-[0.16em] text-[#ff8fa6]/70">
                        {threatBehind ? "behind" : "ahead"}
                      </span>
                    </div>
                  </div>
                )}

                {/* reticle */}
                {panic && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 z-[9] -translate-x-1/2 -translate-y-1/2">
                    <div className="relative h-20 w-20 opacity-45">
                      <div className="absolute inset-0 rounded-full border border-[#ff8fa6]/50" />
                      <div className="absolute inset-3 rounded-full border border-dashed border-[#ff8fa6]/25" />
                      <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-[#ff8fa6]" />
                      <div className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-[#ff8fa6]" />
                      <div className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-[#ff8fa6]" />
                      <div className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-[#ff8fa6]" />
                    </div>
                  </div>
                )}

                {/* bottom HUD */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-3 sm:p-4">
                  <div className="glass min-w-[168px] max-w-[260px] rounded-xl px-3 py-2 sm:min-w-[220px]">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        {powered ? "Courage core" : "Grid cleared"}
                      </span>
                      <span className={`font-mono text-[9px] font-bold tabular-nums ${powered ? "text-[#ffd83d]" : "text-white/60"}`}>
                        {powered ? `${hud.powerTimer.toFixed(1)}s` : `${pelletsEaten}/${hud.totalPellets}`}
                      </span>
                    </div>
                    <div className="thumb-track">
                      <div
                        className="thumb-fill"
                        style={{
                          width: `${powered ? Math.min(100, (hud.powerTimer / 8) * 100) : pelletPct}%`,
                          background: powered
                            ? "linear-gradient(90deg,#ffb31f,#ffe567)"
                            : "linear-gradient(90deg,#7c6bff,#56e8ff)",
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">
                        <span className={`h-1 w-1 rounded-full ${hud.phase === "chase" ? "bg-[#ff5fa2]" : "bg-[#56e8ff]"}`} />
                        {powered ? "specters vulnerable" : `${hud.phase} protocol`}
                      </span>
                      <span className="rounded border border-white/10 px-1 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.14em] text-white/40">
                        {activeView === "pov" ? "POV" : activeView === "3d" ? "3D" : "2D"}
                      </span>
                    </div>
                  </div>

                  <div className="hidden flex-col items-end gap-1.5 sm:flex">
                    {activeView !== "2d" ? (
                      <span className="chip backdrop-blur">
                        <TargetIcon className="h-3 w-3 text-[#56e8ff]" /> Drag to orbit · scroll to zoom
                      </span>
                    ) : (
                      <span className="chip backdrop-blur">
                        <GridIcon className="h-3 w-3 text-[#ffd83d]" /> Classic grid view
                      </span>
                    )}
                    <span className="chip backdrop-blur">
                      <Kbd>V</Kbd> switch 2D / 3D
                    </span>
                  </div>

                  {/* touch D-pad */}
                  <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1 xl:hidden">
                    <span />
                    <button className="dpad-key h-9 w-9" onPointerDown={() => handleDirection("up")} aria-label="Move up">
                      <ArrowIcon dir="up" className="h-4 w-4" />
                    </button>
                    <span />
                    <button className="dpad-key h-9 w-9" onPointerDown={() => handleDirection("left")} aria-label="Move left">
                      <ArrowIcon dir="left" className="h-4 w-4" />
                    </button>
                    <div className="grid place-items-center rounded-lg border border-[#ffd83d]/25 bg-[#ffd83d]/10">
                      <PacMark className="h-4 w-4" />
                    </div>
                    <button className="dpad-key h-9 w-9" onPointerDown={() => handleDirection("right")} aria-label="Move right">
                      <ArrowIcon dir="right" className="h-4 w-4" />
                    </button>
                    <span />
                    <button className="dpad-key h-9 w-9" onPointerDown={() => handleDirection("down")} aria-label="Move down">
                      <ArrowIcon dir="down" className="h-4 w-4" />
                    </button>
                    <span />
                  </div>
                </div>

                {/* threat warning while in POV */}
                {panic && hud.status === "playing" && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-[92px] z-[9] flex justify-center px-4 sm:bottom-[96px]">
                    <div className="flex items-center gap-2.5 rounded-xl border border-[#ff3b5c]/40 bg-[#150309]/85 px-3 py-2 shadow-[0_0_36px_-10px_rgba(255,59,92,0.8)] backdrop-blur">
                      <GhostGlyph color={nearest?.color ?? "#ff3358"} scared className="h-6 w-6" />
                      <div>
                        <div className="glitch font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#ff8fa6]">
                          {nearest?.name ?? "SPECTER"} IS {nearestTiles} TILES AWAY
                        </div>
                        <div className="font-mono text-[7.5px] uppercase tracking-[0.22em] text-[#ff8fa6]/55">
                          Keep moving · do not stop
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* death flash */}
                {hud.status === "dying" && (
                  <div className="pointer-events-none absolute inset-0 z-[12] flex flex-col items-center justify-center bg-[#1a0208]/35">
                    <div className="glitch font-display text-3xl font-bold uppercase tracking-[0.16em] text-[#ff3b5c] text-glow-red sm:text-5xl">
                      Contact
                    </div>
                    <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.34em] text-[#ffb3c0]/80">
                      {hud.lastGhost || "SPECTER"} reached you
                    </div>
                  </div>
                )}

                {/* level clear toast */}
                {hud.status === "levelclear" && (
                  <div className="pointer-events-none absolute inset-0 z-[13] flex items-center justify-center">
                    <div className="glass rounded-2xl border-[#4dfbc4]/30 px-8 py-5 text-center shadow-[0_0_60px_-15px_rgba(77,251,196,0.55)]">
                      <div className="font-display text-2xl font-bold uppercase tracking-[0.16em] text-[#4dfbc4]">
                        Sector cleared
                      </div>
                      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.28em] text-white/45">
                        level {hud.level + 1} initialising…
                      </div>
                    </div>
                  </div>
                )}

                {/* start screen */}
                {hud.status === "idle" && (
                  <div
                    className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-4 backdrop-blur-[2px]"
                    style={{ background: "radial-gradient(ellipse at center, rgba(4,2,12,0.5) 0%, rgba(4,2,12,0.84) 72%, rgba(4,2,12,0.92) 100%)" }}
                  >
                    <div className="glass w-full max-w-[560px] rounded-2xl border-white/15 p-5 text-center shadow-[0_40px_100px_-30px_rgba(0,0,0,0.95)] sm:p-7">
                      <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-[#ffd83d]/25 bg-[#ffd83d]/10 px-3 py-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffd83d]" />
                        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.24em] text-[#ffe167]">
                          Pac-Man · Night shift · Sector 07
                        </span>
                      </div>
                      <h2 className="font-display text-[30px] font-bold leading-[1.02] tracking-tight sm:text-[40px]">
                        THE MAZE IS
                        <br />
                        <span className="text-[#ffd83d] text-glow-yellow">HUNGRY.</span>
                      </h2>
                      <p className="mx-auto mt-3 max-w-sm text-[12.5px] leading-relaxed text-white/50">
                        Clear the grid. Outrun four specters with teeth. Switch to 3D whenever you like — but when
                        they close in, the game switches <span className="text-white/80">for you</span>.
                      </p>
                      <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                        <button onClick={startGame} className="arcade-btn btn-primary focus-ring h-11 w-full px-6 text-[11px] sm:w-auto">
                          Enter the maze
                          <PlayIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setHelpOpen(true)}
                          className="arcade-btn btn-ghost focus-ring h-11 w-full px-5 text-[10px] sm:w-auto"
                        >
                          How to play
                        </button>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        <span className="chip"><CubeIcon className="h-3 w-3 text-[#56e8ff]" /> 3D anytime</span>
                        <span className="chip"><EyeIcon className="h-3 w-3 text-[#ff5fa2]" /> auto panic POV</span>
                        <span className="chip"><GhostGlyph className="h-3 w-3" /> 4 specters</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/30">launch in</span>
                        <div className="flex gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5">
                          <button
                            onClick={() => changeView("2d")}
                            className={`rounded-md px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] transition ${
                              view === "2d" ? "bg-[#ffd83d] text-[#1a1008]" : "text-white/45 hover:text-white/80"
                            }`}
                          >
                            2D neon
                          </button>
                          <button
                            onClick={() => changeView("3d")}
                            disabled={threeFailed}
                            className={`rounded-md px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] transition disabled:opacity-30 ${
                              view === "3d" ? "bg-[#56e8ff] text-[#061014]" : "text-white/45 hover:text-white/80"
                            }`}
                          >
                            3D specter
                          </button>
                        </div>
                        <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30">
                          panic cam {autoPov ? "armed" : "manual"}
                        </span>
                      </div>
                      <div className="neon-line my-4" />
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">
                        <span className="flex items-center gap-1.5"><Kbd>WASD</Kbd> move</span>
                        <span className="flex items-center gap-1.5"><Kbd>V</Kbd> switch view</span>
                        <span className="flex items-center gap-1.5"><Kbd>P</Kbd> force POV</span>
                        <span className="flex items-center gap-1.5"><Kbd>space</Kbd> pause</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* pause screen */}
                {hud.status === "paused" && (
                  <div className="overlay-screen absolute inset-0 z-30 flex items-center justify-center p-4">
                    <div className="glass w-full max-w-[360px] rounded-2xl p-6 text-center">
                      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl border border-[#56e8ff]/30 bg-[#56e8ff]/10">
                        <PauseIcon className="h-5 w-5 text-[#56e8ff]" />
                      </div>
                      <h2 className="font-display text-xl font-bold uppercase tracking-[0.12em]">Dead air</h2>
                      <p className="mt-1 text-[12px] text-white/45">The specters are not paused. They are waiting.</p>
                      <div className="mt-5 flex gap-2">
                        <button onClick={togglePause} className="arcade-btn btn-primary h-10 flex-1 text-[10px]">
                          <PlayIcon className="h-3.5 w-3.5" /> Resume
                        </button>
                        <button onClick={restartGame} className="arcade-btn btn-ghost h-10 px-3 text-[10px]">
                          <RestartIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* game over */}
                {hud.status === "gameover" && (
                  <div className="overlay-screen absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-4">
                    <div className="glass w-full max-w-[430px] rounded-2xl border-[#ff3b5c]/25 p-6 text-center">
                      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-[#ff3b5c]/30 bg-[#ff3b5c]/10">
                        <SkullIcon className="h-6 w-6 text-[#ff5f7c]" />
                      </div>
                      <div className="font-mono text-[8px] uppercase tracking-[0.32em] text-[#ff8fa6]/70">sector 07 · connection severed</div>
                      <h2 className="mt-1 font-display text-3xl font-bold uppercase tracking-[0.08em] text-[#ff5f7c] text-glow-red">
                        Signal lost
                      </h2>
                      <p className="mt-1 text-[12px] text-white/45">
                        {hud.lastGhost ? `${hud.lastGhost} got the last bite.` : "The maze got quiet again."}
                      </p>
                      <div className="mt-5 grid grid-cols-3 gap-2">
                        {[
                          { label: "Score", value: fmt(hud.score) },
                          { label: "Best", value: fmt(hud.high) },
                          { label: "Sector", value: String(hud.level).padStart(2, "0") },
                        ].map((s) => (
                          <div key={s.label} className="glass-soft rounded-xl px-2 py-2.5">
                            <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">{s.label}</div>
                            <div className="mt-0.5 font-display text-base font-bold tabular-nums">{s.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                        <button onClick={restartGame} className="arcade-btn btn-primary h-10 flex-1 text-[10px]">
                          Run it again <RestartIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setView("2d");
                            restartGame();
                          }}
                          className="arcade-btn btn-ghost h-10 px-4 text-[10px]"
                        >
                          Retry in 2D
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* stage footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2.5 sm:px-3">
                <div className="flex items-center gap-2">
                  <LiveDot
                    color={hud.status === "gameover" ? "#ff3b5c" : hud.status === "playing" ? "#4dfbc4" : "#8b84a8"}
                    label={`${statusLabel} · ${hud.pellets} pellets remain`}
                  />
                  <span className="hidden font-mono text-[8.5px] uppercase tracking-[0.16em] text-white/25 sm:inline">
                    · sector {String(hud.level).padStart(2, "0")} · {hud.phase} protocol
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/30">panic cam</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] ${
                      autoPov
                        ? "border border-[#4dfbc4]/25 bg-[#4dfbc4]/10 text-[#4dfbc4]"
                        : "border border-white/10 bg-white/[0.04] text-white/35"
                    }`}
                  >
                    {autoPov ? "armed" : "manual"}
                  </span>
                  <span className={`h-1 w-1 rounded-full ${panic ? "animate-pulse bg-[#ff3b5c]" : "bg-white/20"}`} />
                  <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/30">{activeView}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.055] px-2 pb-1 pt-2 sm:px-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {[
                    { keys: ["W", "A", "S", "D"], label: "move" },
                    { keys: ["V"], label: "2D / 3D" },
                    { keys: ["P"], label: "force POV" },
                    { keys: ["space"], label: "pause" },
                    { keys: ["R"], label: "restart" },
                  ].map((row) => (
                    <span key={row.label} className="flex items-center gap-1">
                      <span className="flex gap-0.5">
                        {row.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/30">{row.label}</span>
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setHelpOpen(true)}
                  className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#56e8ff]/60 transition hover:text-[#56e8ff]"
                >
                  field manual →
                </button>
              </div>
            </div>

            {threeFailed && (
              <div className="mt-3 rounded-xl border border-[#ffd83d]/25 bg-[#ffd83d]/[0.06] px-3 py-2 text-[11px] text-[#ffe167]/80">
                3D renderer unavailable on this device — running the neon 2D grid instead.
              </div>
            )}
          </section>

          {/* control sidebar */}
          <aside className="flex min-w-0 flex-col gap-3.5">
            <div className="glass rounded-2xl p-4">
              <PanelTitle code="cam / 01">Vision control</PanelTitle>
              <div className="flex gap-1.5 rounded-xl border border-white/10 bg-black/35 p-1">
                <button type="button" className="view-tab focus-ring" data-active={view === "2d"} onClick={() => changeView("2d")}>
                  <span className="flex items-center gap-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.16em]">
                    <GridIcon className="h-3.5 w-3.5" /> 2D neon
                  </span>
                  <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] opacity-55">classic grid</span>
                </button>
                <button
                  type="button"
                  className="view-tab focus-ring"
                  data-active={view === "3d"}
                  onClick={() => changeView("3d")}
                  disabled={threeFailed}
                >
                  <span className="flex items-center gap-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.16em]">
                    <CubeIcon className="h-3.5 w-3.5" /> 3D specter
                  </span>
                  <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] opacity-55">
                    {threeFailed ? "unavailable" : "free roam"}
                  </span>
                </button>
              </div>

              <div className="my-3.5 h-px bg-white/[0.07]" />

              <Toggle
                checked={autoPov}
                onChange={(v) => {
                  setAutoPov(v);
                  if (!v) setPovLive(false);
                }}
                label="Auto panic POV"
                description="Ghost within 2.8 tiles → first-person camera kicks in automatically."
              />

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setForcePov((v) => !v)}
                  disabled={threeFailed}
                  className={`arcade-btn h-9 flex-1 text-[9px] ${
                    forcePov || panic ? "border border-[#ff3b5c]/50 bg-[#ff3b5c]/15 text-[#ff9db0]" : "btn-ghost"
                  } ${threeFailed ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <EyeIcon className="h-3.5 w-3.5" />
                  {forcePov ? "Exit panic cam" : "POV on demand"}
                  <Kbd>P</Kbd>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-white/40">
                  <span className={`h-1.5 w-1.5 rounded-full ${panic ? "animate-pulse bg-[#ff3b5c]" : autoPov ? "bg-[#4dfbc4]" : "bg-white/25"}`} />
                  {panic ? "POV engaged" : autoPov ? "Panic cam armed" : "Manual camera"}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/25">V to switch</span>
              </div>
            </div>

            {/* Iron Man Gesture Core Panel */}
            <div className="glass rounded-2xl border border-[#00d4ff]/20 p-4 shadow-[0_0_25px_-10px_rgba(0,212,255,0.25)]">
              <PanelTitle code="stark / 03">Gesture Core</PanelTitle>
              <Toggle
                checked={gestureEnabled}
                onChange={setGestureEnabled}
                label="Iron Man Hand Tracking"
                description="Control Pac-Man using your webcam & mid-air hand gestures."
              />

              <div className="mt-3.5 space-y-1.5 font-mono text-[9px] text-white/50">
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <span>☝️</span> Point Finger / Move Hand
                  </span>
                  <span className="text-[#ffd83d]">Steer W/A/S/D</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <span>✊</span> Clench Closed Fist
                  </span>
                  <span className="text-[#ffd83d]">Emergency Brake</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <span>🤏</span> Pinch Thumb + Index
                  </span>
                  <span className="text-[#ff5fa2]">Tactical POV</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-[#00d4ff]/20 bg-[#00d4ff]/[0.04] px-2.5 py-2">
                <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#00d4ff]">
                  <span className={`h-1.5 w-1.5 rounded-full ${gestureEnabled ? "animate-pulse bg-[#00d4ff]" : "bg-white/20"}`} />
                  {gestureEnabled ? "Optic tracking online" : "Sensors standby"}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/35">
                  {gestureEnabled ? "60Hz MediaPipe" : "Press G or Click"}
                </span>
              </div>
            </div>

            <div className="glass rounded-2xl p-4">
              <PanelTitle code="threat / 02">Proximity monitor</PanelTitle>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="font-display text-[38px] font-bold leading-none tabular-nums transition-colors"
                      style={{ color: threat.color }}
                    >
                      {threatDisplay}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">tiles</span>
                  </div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-white/30">nearest hostile</div>
                </div>
                <span
                  className="rounded-md border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: threat.color, borderColor: `${threat.color}44`, background: threat.bg }}
                >
                  {threat.label}
                </span>
              </div>

              <div className="relative mt-3">
                <div className="thumb-track threat-scan">
                  <div
                    className="thumb-fill"
                    style={{
                      width: `${threatPct}%`,
                      background: `linear-gradient(90deg, #4dfbc4, ${threat.color})`,
                      boxShadow: `0 0 14px ${threat.color}66`,
                    }}
                  />
                </div>
                <div className="absolute -top-1 bottom-[-4px] left-[64%] w-px bg-[#ff3b5c]/40" />
                <div className="mt-1.5 flex justify-between font-mono text-[7px] uppercase tracking-[0.12em] text-white/25">
                  <span>safe</span>
                  <span className="text-[#ff8fa6]/60">POV trip line</span>
                  <span>contact</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  {nearest ? (
                    <>
                      <GhostGlyph color={nearest.color} scared className="h-5 w-5 shrink-0" />
                      <span className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/70">
                        {nearest.name}
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">No contact</span>
                  )}
                </span>
                <span className={`font-mono text-[8px] uppercase tracking-[0.14em] ${panic ? "text-[#ff8fa6]" : "text-white/30"}`}>
                  {powered ? "hunt mode" : panic ? "panic cam" : "tracking"}
                </span>
              </div>

              {panic && (
                <div className="mt-2.5 overflow-hidden rounded-lg border border-[#ff3b5c]/35 bg-[#ff3b5c]/10 px-2.5 py-2">
                  <div className="glitch font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-[#ff9db0]">
                    Camera relocated → Pac-Man&apos;s eyes
                  </div>
                  <div className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-[#ff9db0]/55">
                    {nearest ? `${nearest.name} is ${threatDisplay} tiles from your face` : "threat in corridor"}
                  </div>
                </div>
              )}
            </div>

            <div id="ghost-files" className="glass scroll-mt-24 rounded-2xl p-4">
              <PanelTitle code="04 active">Ghost files</PanelTitle>
              <div className="space-y-1.5">
                {hud.ghosts.map((g) => {
                  const st = ghostState(g, hud.threat);
                  return (
                    <div
                      key={g.id}
                      className="ghost-card flex items-center gap-2.5 rounded-lg border border-white/[0.055] bg-white/[0.022] px-2 py-1.5"
                    >
                      <div
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
                        style={{ borderColor: `${g.color}33`, background: `${g.color}12` }}
                      >
                        <GhostGlyph color={g.color} scared={g.frightened} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-white/85">{g.name}</span>
                          <span className="font-mono text-[7.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: st.color }}>
                            {st.label}
                          </span>
                        </div>
                        <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/28">{g.role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex items-center justify-between font-mono text-[7.5px] uppercase tracking-[0.12em] text-white/25">
                <span>power cores = temporary courage</span>
                <span className="text-[#ffd83d]/50">×4 chain</span>
              </div>
            </div>

            <button
              onClick={() => setHelpOpen(true)}
              className="glass sheen flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition hover:border-[#7c6bff]/30"
            >
              <span>
                <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Field manual
                </span>
                <span className="mt-0.5 block text-[10px] text-white/30">Controls, ghosts and panic protocol</span>
              </span>
              <ChevronIcon className="h-4 w-4 text-white/30" />
            </button>
          </aside>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              code: "01",
              title: "One maze. Two realities.",
              body: "Instantly flip from a hand-drawn neon arcade grid to a fully lit 3D maze. Your score, ghosts, and nerve carry over untouched.",
              icon: <CubeIcon className="h-5 w-5" />,
              tint: "#56e8ff",
            },
            {
              code: "02",
              title: "Panic cam protocol",
              body: "Cross into a specter's kill zone and the camera snaps into Pac-Man's eyes — first-person, no warning, no way out but through.",
              icon: <EyeIcon className="h-5 w-5" />,
              tint: "#ff5fa2",
            },
            {
              code: "03",
              title: "Specters with teeth",
              body: "Blink stalks, Vex ambushes, Wraith flanks, Hex improvises. Every one of them has a personal file and a very wide mouth.",
              icon: <GhostGlyph className="h-5 w-5" />,
              tint: "#ffd83d",
            },
          ].map((f) => (
            <div key={f.code} className="glass sheen group rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div
                  className="grid h-9 w-9 place-items-center rounded-xl border"
                  style={{ color: f.tint, borderColor: `${f.tint}30`, background: `${f.tint}0f` }}
                >
                  {f.icon}
                </div>
                <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/20">module / {f.code}</span>
              </div>
              <h3 className="mt-3 font-display text-[14px] font-bold tracking-tight text-white/90">{f.title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.018] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-[#ffd83d]/20 bg-[#ffd83d]/[0.07]">
              <PacMark className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">High score protocol</div>
              <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/28">
                saved locally · {fmt(Math.max(hud.high, hud.score))} points
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.14em] text-white/25">
            <span className="flex items-center gap-1.5"><BoltIcon className="h-3 w-3 text-[#ffd83d]/60" /> 8s courage</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden items-center gap-1.5 sm:flex"><EyeIcon className="h-3 w-3 text-[#ff5fa2]/60" /> auto POV</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden items-center gap-1.5 sm:flex"><SkullIcon className="h-3 w-3 text-[#ff3b5c]/60" /> 1 life per bite</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] bg-black/20">
        <div className="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <PacMark className="h-5 w-5 opacity-70" />
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
              Neon Chomp <span className="text-white/20">// Phantom Arcade</span>
            </span>
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/25">
            © 2087 Sector 07 · Fan-made Pac-Man arcade experiment · Play with the lights down
          </div>
        </div>
      </footer>

      {/* field manual */}
      {helpOpen && (
        <div
          className="overlay-screen fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setHelpOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Field manual"
        >
          <div className="glass my-6 w-full max-w-2xl rounded-2xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#56e8ff]/70">field manual · rev 07</div>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Survive the night shift.</h2>
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60 transition hover:text-white"
                aria-label="Close manual"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                {
                  t: "Eat the grid",
                  d: "Clear every glowing pellet to advance the sector. Power cores flip the specters blue for eight seconds of pure courage.",
                  c: "#ffd83d",
                  i: <BoltIcon className="h-4 w-4" />,
                },
                {
                  t: "Switch reality",
                  d: "Tap 2D / 3D or hit V. 3D is chase-cam by default; drag to orbit the maze, scroll to zoom. Switching mid-run is free.",
                  c: "#56e8ff",
                  i: <CubeIcon className="h-4 w-4" />,
                },
                {
                  t: "Panic cam",
                  d: "With auto POV armed, any hostile ghost breaking 2.8 tiles snaps the camera into Pac-Man's eyes. It releases once the corridor is safe.",
                  c: "#ff5fa2",
                  i: <EyeIcon className="h-4 w-4" />,
                },
                {
                  t: "Know the pack",
                  d: "Blink chases directly. Vex aims four tiles ahead. Wraith flanks using Blink's position. Hex gets unpredictable up close.",
                  c: "#c39bff",
                  i: <GhostGlyph className="h-4 w-4" />,
                },
              ].map((item) => (
                <div key={item.t} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <div className="flex items-center gap-2" style={{ color: item.c }}>
                    {item.i}
                    <span className="font-display text-[12px] font-bold uppercase tracking-[0.1em]">{item.t}</span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/45">{item.d}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 p-3">
              <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">control surface</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {[
                  ["Move", "WASD / arrows"],
                  ["Gestures", "G (☝️ Steer / ✊ Brake)"],
                  ["View", "V (2D / 3D)"],
                  ["Force POV", "P (Pinch 🤏)"],
                  ["Pause", "Space (Fist ✊)"],
                  ["Mute", "M"],
                  ["Restart", "R"],
                ].map(([a, b]) => (
                  <div key={a} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/30">{a}</span>
                    <span className="font-mono text-[9px] text-white/65">{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] text-white/30">
                Tip: buffer a turn before the junction — the maze snap is forgiving.
              </p>
              <button onClick={() => setHelpOpen(false)} className="arcade-btn btn-primary h-9 px-4 text-[10px]">
                Got it <ChevronIcon className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
