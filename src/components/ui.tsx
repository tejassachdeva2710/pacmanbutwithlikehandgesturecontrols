import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const PacMark = ({ className = "", ...props }: IconProps) => (
  <svg viewBox="0 0 48 48" className={className} {...props}>
    <defs>
      <linearGradient id="pacGrad" x1="8" y1="6" x2="42" y2="44" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFF3A6" />
        <stop offset="0.5" stopColor="#FFD83D" />
        <stop offset="1" stopColor="#FFA700" />
      </linearGradient>
    </defs>
    <circle cx="24" cy="24" r="20" fill="url(#pacGrad)" />
    <path d="M24 24 46 11v26L24 24Z" fill="#07050F" />
    <circle cx="23" cy="13" r="2.8" fill="#2A1744" />
  </svg>
);

export const GhostGlyph = ({
  color = "#ff3358",
  scared = false,
  className = "",
  ...props
}: IconProps & { color?: string; scared?: boolean }) => (
  <svg viewBox="0 0 48 48" className={className} {...props}>
    <path
      d="M6 44V25a18 18 0 0 1 36 0v19l-6-4.5-6 4.5-6-4.5-6 4.5-6-4.5L6 44Z"
      fill={scared ? "#3543ff" : color}
    />
    <g fill="#fff8ff">
      <ellipse cx="17.5" cy="23" rx="5.4" ry="6.4" />
      <ellipse cx="30.5" cy="23" rx="5.4" ry="6.4" />
    </g>
    <g fill="#160d28">
      <circle cx={scared ? 17.5 : 19} cy="24" r="2.5" />
      <circle cx={scared ? 30.5 : 32} cy="24" r="2.5" />
    </g>
    {scared ? (
      <path d="M15 35.5h18l-2.2 2.6-2.2-2.6-2.1 2.6-2.1-2.6-2.2 2.6-2.1-2.6L17.2 38 15 35.5Z" fill="#fff8ff" />
    ) : (
      <path d="M17 34.5h14" stroke="#160d28" strokeWidth="2.4" strokeLinecap="round" opacity=".35" />
    )}
  </svg>
);

export const GridIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
  </svg>
);

export const CubeIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9L12 2.8Z" />
    <path d="m3 7.5 9 4.7 9-4.7M12 12.2v9" />
  </svg>
);

export const EyeIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const VolumeIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.4a8 8 0 0 1 0 11.2" />
  </svg>
);

export const MuteIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <path d="m16 9.5 5 5m0-5-5 5" />
  </svg>
);

export const HelpIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.8v.4" />
    <circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
  </svg>
);

export const PauseIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </svg>
);

export const RestartIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 10a8 8 0 1 1 2.2 7.4" />
    <path d="M4 4.5V10h5.5" />
  </svg>
);

export const BoltIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M13.5 2.5 4.8 13.4h5.6l-.9 8.1 8.7-10.9h-5.6l.9-8.1Z" fill="currentColor" stroke="none" />
  </svg>
);

export const TargetIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4" />
  </svg>
);

export const ArrowIcon = ({ dir, ...props }: IconProps & { dir: "up" | "down" | "left" | "right" }) => {
  const rotation = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg {...base(props)} style={{ transform: `rotate(${rotation}deg)`, ...(props.style || {}) }}>
      <path d="M12 20V4M6 10l6-6 6 6" />
    </svg>
  );
};

export const SkullIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 11.5a7 7 0 1 1 14 0v4.2l-2.2 1.5v2.3h-9.6v-2.3L5 15.7v-4.2Z" />
    <circle cx="9.2" cy="11" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="11" r="1.5" fill="currentColor" stroke="none" />
    <path d="M10.3 15.8v2.1M13.7 15.8v2.1" />
  </svg>
);

export const SparkIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 2.5c.7 5.3 4.2 8.8 9.5 9.5-5.3.7-8.8 4.2-9.5 9.5-.7-5.3-4.2-8.8-9.5-9.5 5.3-.7 8.8-4.2 9.5-9.5Z" />
  </svg>
);

export const ChevronIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const HandIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M18 11V6a2 2 0 0 0-4 0v4" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-white/15 border-b-white/30 bg-white/[0.07] px-1.5 font-mono text-[10px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
    {children}
  </kbd>
);

export const LiveDot = ({ color = "#4dfbc4", label }: { color?: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60">
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: color }} />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
    {label}
  </span>
);

export const Toggle = ({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className="group flex w-full items-center justify-between gap-4 text-left"
  >
    <span>
      <span className="block text-[13px] font-semibold text-white/90">{label}</span>
      {description && <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{description}</span>}
    </span>
    <span
      className={`relative h-[22px] w-[42px] shrink-0 rounded-full border transition-all duration-300 ${
        checked
          ? "border-[#ffd83d]/50 bg-[#ffd83d]/25 shadow-[0_0_16px_rgba(255,216,61,0.35)]"
          : "border-white/15 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all duration-300 ${
          checked ? "left-[22px] bg-[#ffe567] shadow-[0_0_10px_rgba(255,229,103,0.8)]" : "left-[3px] bg-white/45"
        }`}
      />
    </span>
  </button>
);

export const PanelTitle = ({ children, code }: { children: React.ReactNode; code?: string }) => (
  <div className="mb-4 flex items-center justify-between">
    <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">{children}</h3>
    {code && <span className="font-mono text-[9px] tracking-[0.16em] text-white/25">{code}</span>}
  </div>
);
