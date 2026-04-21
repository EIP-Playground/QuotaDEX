import React from "react";

const CX = 150;
const CY = 130;
const RADIUS = 85;

const AGENTS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
  return { x: CX + Math.cos(angle) * RADIUS, y: CY + Math.sin(angle) * RADIUS, i };
});

const STATUS_COLORS: Record<number, string> = {
  0: "#c8a435",
  1: "#c8a435",
  2: "#3a4a1a",
  3: "#3a4a1a",
  4: "#7a7560",
  5: "#7a7560"
};

export function MeshSvg() {
  return (
    <svg viewBox="0 0 300 260" style={{ width: "100%", height: "100%" }} aria-hidden="true">
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 Z" fill="#c8a435" fillOpacity="0.6" />
        </marker>
      </defs>

      {AGENTS.map((a) => {
        const dx = a.x - CX;
        const dy = a.y - CY;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        return (
          <line
            key={`line-${a.i}`}
            x1={CX + ux * 23}
            y1={CY + uy * 23}
            x2={a.x - ux * 15}
            y2={a.y - uy * 15}
            stroke="#c8a435"
            strokeWidth="1.2"
            strokeOpacity="0.45"
            markerEnd="url(#arrow)"
          />
        );
      })}

      <circle cx={CX} cy={CY} r={22} fill="#c8a435" fillOpacity="0.18" stroke="#c8a435" strokeWidth="1.5" />
      <text x={CX} y={CY + 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#c8a435" fontFamily="monospace">
        QDEX
      </text>

      {AGENTS.map((a) => (
        <g key={`agent-${a.i}`}>
          <circle
            cx={a.x}
            cy={a.y}
            r={12}
            fill={STATUS_COLORS[a.i]}
            fillOpacity="0.15"
            stroke={STATUS_COLORS[a.i]}
            strokeWidth="1.2"
          />
          <text
            x={a.x}
            y={a.y + 4}
            textAnchor="middle"
            fontSize="7"
            fontWeight="600"
            fill={STATUS_COLORS[a.i]}
            fontFamily="monospace"
          >
            A{a.i + 1}
          </text>
          <text
            x={a.x}
            y={a.y + 22}
            textAnchor="middle"
            fontSize="8"
            fill="#7a7560"
            fontFamily="monospace"
          >
            Agent_{a.i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
