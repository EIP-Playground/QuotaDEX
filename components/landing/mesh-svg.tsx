import React from "react";

export function MeshSvg() {
  const RINGS = 18;
  const cx = 150;
  const cy = 130;

  return (
    <svg
      viewBox="0 0 300 260"
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="meshCoreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3c4" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#d4b04a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#c8a435" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="meshNodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3c4" stopOpacity="1" />
          <stop offset="55%" stopColor="#d4b04a" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#c8a435" stopOpacity="0" />
        </radialGradient>
      </defs>

      {Array.from({ length: RINGS }).map((_, i) => {
        const t = i / (RINGS - 1);
        const rx = 30 + t * 90;
        const ry = 18 + t * 55;
        const tilt = -22 + Math.sin(i * 0.8) * 18;
        const opacity = 0.35 - t * 0.22;
        return (
          <ellipse
            key={`ring-${i}`}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="#c8a435"
            strokeWidth="0.55"
            strokeOpacity={opacity}
            transform={`rotate(${tilt} ${cx} ${cy})`}
          />
        );
      })}

      {Array.from({ length: RINGS }).map((_, i) => {
        const t = i / (RINGS - 1);
        const rx = 35 + t * 85;
        const ry = 20 + t * 50;
        const tilt = 28 + Math.cos(i * 0.7) * 14;
        const opacity = 0.32 - t * 0.2;
        return (
          <ellipse
            key={`ring-b-${i}`}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="#c8a435"
            strokeWidth="0.5"
            strokeOpacity={opacity}
            transform={`rotate(${tilt} ${cx} ${cy})`}
          />
        );
      })}

      <circle cx={cx} cy={cy} r="40" fill="url(#meshCoreGlow)" />

      <g className="meshOrbit meshOrbitA">
        <circle cx={cx + 70} cy={cy} r="2.6" fill="url(#meshNodeGlow)" />
      </g>
      <g className="meshOrbit meshOrbitB">
        <circle cx={cx + 95} cy={cy} r="2.2" fill="url(#meshNodeGlow)" />
      </g>
      <g className="meshOrbit meshOrbitC">
        <circle cx={cx + 55} cy={cy} r="1.8" fill="url(#meshNodeGlow)" />
      </g>
      <g className="meshOrbit meshOrbitD">
        <circle cx={cx + 85} cy={cy} r="2" fill="url(#meshNodeGlow)" />
      </g>
    </svg>
  );
}
