"use client";

import React from "react";
import { IconType } from "react-icons";

type Orbit = {
  id: string;
  rx: number;
  ry: number;
  tilt: number;
  dur: number;
  reverse?: boolean;
};

type OrbitIcon = {
  Icon: IconType;
  orbit: string;
  phase: number;
};

type HeroOrbitSvgProps = {
  orbits: Orbit[];
  icons: OrbitIcon[];
};

const CX = 150;
const CY = 130;

function orbitPathD(rx: number, ry: number) {
  return `M ${CX - rx},${CY} A ${rx},${ry} 0 1,0 ${CX + rx},${CY} A ${rx},${ry} 0 1,0 ${CX - rx},${CY}`;
}

function IconAt({
  Icon,
  pathId,
  dur,
  beginOffset,
  reverse,
  layer
}: {
  Icon: IconType;
  pathId: string;
  dur: number;
  beginOffset: number;
  reverse?: boolean;
  layer: "front" | "back";
}) {
  const opacityValues =
    layer === "front" ? "0;0;1;1;0" : "1;1;0;0;1";

  // Depth scale, synced to motion: near half (0-0.5) grows, far half shrinks.
  // Reverse flips near/far because the path runs backwards.
  const scaleValues = reverse
    ? "1;0.7;1;1.2;1"
    : "1;1.2;1;0.7;1";

  return (
    <g>
      <g>
        <foreignObject x={-10} y={-10} width={20} height={20} overflow="visible">
          <div
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gold)",
              opacity: 0.85,
              filter: "drop-shadow(0 0 5px rgba(200, 164, 53, 0.55))"
            }}
          >
            <Icon style={{ width: 16, height: 16, strokeWidth: 1.4 }} />
          </div>
        </foreignObject>
        <animateTransform
          attributeName="transform"
          type="scale"
          values={scaleValues}
          keyTimes="0;0.25;0.5;0.75;1"
          dur={`${dur}s`}
          begin={`${beginOffset}s`}
          repeatCount="indefinite"
          additive="sum"
        />
      </g>
      <animate
        attributeName="opacity"
        values={opacityValues}
        keyTimes="0;0.49;0.5;0.99;1"
        dur={`${dur}s`}
        begin={`${beginOffset}s`}
        repeatCount="indefinite"
      />
      <animateMotion
        dur={`${dur}s`}
        begin={`${beginOffset}s`}
        repeatCount="indefinite"
        keyPoints={reverse ? "1;0" : "0;1"}
        keyTimes="0;1"
      >
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </g>
  );
}

export function HeroOrbitSvg({ orbits, icons }: HeroOrbitSvgProps) {
  return (
    <svg
      viewBox="0 0 300 260"
      overflow="visible"
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        {orbits.map((o) => (
          <path
            key={`orbit-path-${o.id}`}
            id={`hero-orbit-path-${o.id}`}
            d={orbitPathD(o.rx, o.ry)}
            transform={`rotate(${o.tilt} ${CX} ${CY})`}
            fill="none"
          />
        ))}
      </defs>

      {/* Faint orbit trails */}
      {orbits.map((o) => (
        <ellipse
          key={`trail-${o.id}`}
          cx={CX}
          cy={CY}
          rx={o.rx}
          ry={o.ry}
          fill="none"
          stroke="#c8a435"
          strokeOpacity="0.08"
          strokeWidth="0.5"
          transform={`rotate(${o.tilt} ${CX} ${CY})`}
        />
      ))}

      {/* BACK layer — icons on the far half of the orbit (occluded by the globe in stacking order) */}
      {icons.map((item, i) => {
        const o = orbits.find((x) => x.id === item.orbit);
        if (!o) return null;
        const begin = -(item.phase / 360) * o.dur;
        return (
          <IconAt
            key={`back-${i}`}
            Icon={item.Icon}
            pathId={`hero-orbit-path-${o.id}`}
            dur={o.dur}
            beginOffset={begin}
            reverse={o.reverse}
            layer="back"
          />
        );
      })}
    </svg>
  );
}

export function HeroOrbitSvgFront({ orbits, icons }: HeroOrbitSvgProps) {
  return (
    <svg
      viewBox="0 0 300 260"
      overflow="visible"
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        {orbits.map((o) => (
          <path
            key={`orbit-path-front-${o.id}`}
            id={`hero-orbit-path-front-${o.id}`}
            d={orbitPathD(o.rx, o.ry)}
            transform={`rotate(${o.tilt} ${CX} ${CY})`}
            fill="none"
          />
        ))}
      </defs>

      {icons.map((item, i) => {
        const o = orbits.find((x) => x.id === item.orbit);
        if (!o) return null;
        const begin = -(item.phase / 360) * o.dur;
        return (
          <IconAt
            key={`front-${i}`}
            Icon={item.Icon}
            pathId={`hero-orbit-path-front-${o.id}`}
            dur={o.dur}
            beginOffset={begin}
            reverse={o.reverse}
            layer="front"
          />
        );
      })}
    </svg>
  );
}

export const HERO_ORBITS: Orbit[] = [
  { id: "a", rx: 110, ry: 65, tilt: -18, dur: 24 },
  { id: "b", rx: 125, ry: 50, tilt: 22,  dur: 34, reverse: true }
];
