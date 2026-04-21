import React from "react";

export function GlobeSvg() {
  const latitudes = [-60, -40, -20, 0, 20, 40, 60];
  const longitudes = [-120, -80, -40, 0, 40, 80, 120];

  return (
    <svg viewBox="0 0 300 260" style={{ width: "100%", height: "100%", opacity: 0.85 }} aria-hidden="true">
      <circle cx="150" cy="130" r="95" fill="none" stroke="#c8a435" strokeWidth="0.8" strokeOpacity="0.45" />
      {latitudes.map((lat, i) => {
        const y = 130 + (lat / 90) * 95;
        const r = Math.cos((lat * Math.PI) / 180) * 95;
        return <ellipse key={`lat-${i}`} cx="150" cy={y} rx={r} ry={r * 0.28} fill="none" stroke="#c8a435" strokeWidth="0.7" strokeOpacity="0.4" />;
      })}
      {longitudes.map((ln, i) => (
        <ellipse
          key={`lng-${i}`}
          cx="150"
          cy="130"
          rx={Math.abs(Math.cos((ln * Math.PI) / 180)) * 95}
          ry="95"
          fill="none"
          stroke="#c8a435"
          strokeWidth="0.7"
          strokeOpacity="0.4"
          transform={`rotate(${ln},150,130)`}
        />
      ))}
    </svg>
  );
}
