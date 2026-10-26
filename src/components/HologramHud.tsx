import { useEffect, useRef, useState } from "react";
import { handTracker, type GestureTelemetry, type HandDirection } from "../game/handTracking";
import { SparkIcon } from "./ui";

interface HologramHudProps {
  onDirection: (dir: HandDirection) => void;
  onAction: (action: "pause" | "pov" | "restart") => void;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function HologramHud({
  onDirection,
  onAction,
  enabled,
  onToggle,
}: HologramHudProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [telemetry, setTelemetry] = useState<GestureTelemetry>({
    active: false,
    handPresent: false,
    direction: null,
    gestureName: "OFFLINE",
    isFist: false,
    isPinch: false,
    confidence: 0,
    fps: 0,
    landmarks: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    handTracker.setTelemetryCallback((t) => setTelemetry({ ...t }));
    return () => handTracker.setTelemetryCallback(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      handTracker.stop();
      setError(null);
      setLoading(false);
      return;
    }

    let isSubscribed = true;
    setLoading(true);
    setError(null);

    handTracker
      .init(
        (dir) => onDirection(dir),
        (action) => onAction(action),
        canvasRef.current
      )
      .then((ok) => {
        if (!isSubscribed) return;
        setLoading(false);
        if (!ok) {
          setError("Webcam access denied or unavailable.");
          onToggle(false);
        }
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setLoading(false);
        setError(err?.message || "Failed to start vision tracker.");
        onToggle(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [enabled, onDirection, onAction, onToggle]);

  useEffect(() => {
    if (canvasRef.current) {
      handTracker.setCanvas(canvasRef.current);
    }
  }, [canvasRef.current]);

  if (!enabled && !error) return null;

  return (
    <div className="pointer-events-auto absolute right-3 top-16 z-30 flex flex-col items-end sm:right-5 sm:top-18">
      <div className="glass group relative w-72 overflow-hidden rounded-2xl border border-[#00d4ff]/30 bg-[#060412]/90 shadow-[0_0_35px_-8px_rgba(0,212,255,0.45)] backdrop-blur-xl transition-all duration-300">
        {/* Hologram top edge beam */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#00d4ff] to-transparent opacity-80" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  telemetry.handPresent ? "bg-[#00d4ff]" : "bg-[#ffd83d]"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  telemetry.handPresent ? "bg-[#00d4ff]" : "bg-[#ffd83d]"
                }`}
              />
            </span>
            <span className="font-display text-[11px] font-bold tracking-wider text-[#00d4ff]">
              IRON MAN // GESTURE HUD
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="rounded p-1 font-mono text-[9px] text-white/50 hover:bg-white/10 hover:text-white"
              title={collapsed ? "Expand PiP" : "Minimize PiP"}
            >
              {collapsed ? "▲ EXPAND" : "▼ MIN"}
            </button>
            <button
              onClick={() => onToggle(false)}
              className="rounded p-1 font-mono text-[10px] text-white/40 hover:bg-red-500/20 hover:text-red-400"
              title="Close Gesture Tracking"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 text-[11px] text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* Collapsible Content */}
        {!collapsed && !error && (
          <div className="relative p-2.5">
            {/* Loading spinner */}
            {loading && (
              <div className="flex h-44 flex-col items-center justify-center gap-2">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#00d4ff]/30 border-t-[#00d4ff]" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#00d4ff]">
                  Calibrating Optics...
                </span>
              </div>
            )}

            {/* Hologram Canvas Viewport */}
            <div className={`relative overflow-hidden rounded-xl border border-[#00d4ff]/20 bg-black/60 ${loading ? "hidden" : "block"}`}>
              <canvas
                ref={canvasRef}
                width={280}
                height={200}
                className="block h-[180px] w-full"
              />

              {/* Holographic Watermark */}
              <div className="pointer-events-none absolute bottom-1.5 right-2 font-mono text-[7.5px] uppercase tracking-widest text-[#00d4ff]/40">
                STARK OPTIC-SYS
              </div>
            </div>

            {/* Gesture Quick Readout / Telemetry */}
            {!loading && (
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 font-mono text-[9.5px]">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
                  <div className="text-[7.5px] uppercase tracking-wider text-white/40">Direction</div>
                  <div className={`font-bold ${telemetry.direction ? "text-[#ffd83d]" : "text-white/60"}`}>
                    {telemetry.direction ? `▲ ${telemetry.direction.toUpperCase()}` : "NEUTRAL"}
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
                  <div className="text-[7.5px] uppercase tracking-wider text-white/40">Action</div>
                  <div className={`font-bold ${telemetry.isFist ? "text-[#ffd83d]" : telemetry.isPinch ? "text-[#ff5fa2]" : "text-white/60"}`}>
                    {telemetry.isFist ? "BRAKE / PAUSE" : telemetry.isPinch ? "TACTICAL POV" : "STEERING"}
                  </div>
                </div>
              </div>
            )}

            {/* Quick guide pills */}
            <div className="mt-2 flex flex-wrap gap-1 font-mono text-[8px] text-white/45">
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5">☝️ Point to Steer</span>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5">✊ Fist to Brake</span>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5">🤏 Pinch for POV</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
