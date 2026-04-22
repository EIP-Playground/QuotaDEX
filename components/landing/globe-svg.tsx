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

export function GlobeSvgSpinning() {
  const latitudes = [-60, -40, -20, 0, 20, 40, 60];
  const longitudes = [-120, -80, -40, 0, 40, 80, 120];

  return (
    <svg viewBox="0 0 300 260" style={{ width: "100%", height: "100%", opacity: 0.85 }} aria-hidden="true">
      <defs>
        <radialGradient id="heroGlobeNode">
          <stop offset="0%" stopColor="#fff3c4" stopOpacity="1" />
          <stop offset="45%" stopColor="#d4b04a" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#c8a435" stopOpacity="0" />
        </radialGradient>
        {longitudes.map((ln, i) => {
          const rx = Math.abs(Math.cos((ln * Math.PI) / 180)) * 95;
          return (
            <path
              key={`lng-defs-${i}`}
              id={`heroGlobeLngPath-${i}`}
              d={`M ${150 - rx},130 A ${rx},95 0 1,0 ${150 + rx},130 A ${rx},95 0 1,0 ${150 - rx},130`}
              fill="none"
            />
          );
        })}
      </defs>

      <circle cx="150" cy="130" r="95" fill="none" stroke="#c8a435" strokeWidth="0.6" strokeOpacity="0.22" />

      {latitudes.map((lat, i) => {
        const y = 130 + (lat / 90) * 95;
        const r = Math.cos((lat * Math.PI) / 180) * 95;
        return <ellipse key={`lat-${i}`} cx="150" cy={y} rx={r} ry={r * 0.28} fill="none" stroke="#c8a435" strokeWidth="0.5" strokeOpacity="0.18" />;
      })}

      <g className="heroGlobeLong">
        {longitudes.map((ln, i) => {
          const rx = Math.abs(Math.cos((ln * Math.PI) / 180)) * 95;
          const dur = 4 + (i % 3) * 1.5;
          const delay = (i * 0.7) % dur;
          return (
            <g key={`lng-${i}`} transform={`rotate(${ln} 150 130)`}>
              <ellipse
                cx="150"
                cy="130"
                rx={rx}
                ry="95"
                fill="none"
                stroke="#c8a435"
                strokeWidth="0.5"
                strokeOpacity="0.18"
              />
              <circle r="2.4" fill="url(#heroGlobeNode)">
                <animateMotion dur={`${dur}s`} begin={`-${delay}s`} repeatCount="indefinite">
                  <mpath href={`#heroGlobeLngPath-${i}`} />
                </animateMotion>
              </circle>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
