"use client";

import React, { useEffect, useRef } from "react";

type Dot = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  op: number;
  r: number;
};

type Ripple = { x: number; y: number; t: number };

function gauss() {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function DotCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dots: Dot[] = [];
    let ripples: Ripple[] = [];
    let raf = 0;
    const mouse = { x: -9999, y: -9999 };

    const build = () => {
      dots = [];
      const pos: Array<[number, number]> = [
        [0.04, 0.06],
        [0.22, 0.04],
        [0.85, 0.04],
        [0.95, 0.18],
        [0.92, 0.48],
        [0.78, 0.85],
        [0.12, 0.85],
        [0.03, 0.5],
        [0.5, 0.95],
        [0.45, 0.02],
        [0.68, 0.5],
        [0.3, 0.45]
      ];
      pos.forEach(([rx, ry]) => {
        const cx = rx * W;
        const cy = ry * H;
        const sp = Math.min(W, H) * (0.07 + Math.random() * 0.05);
        const n = 100 + Math.floor(Math.random() * 150);
        for (let i = 0; i < n; i++) {
          const x = cx + gauss() * sp;
          const y = cy + gauss() * sp;
          dots.push({
            x,
            y,
            ox: x,
            oy: y,
            vx: 0,
            vy: 0,
            op: 0.15 + Math.random() * 0.55,
            r: 1.1 + Math.random() * 0.8
          });
        }
      });
    };

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = document.body.scrollHeight;
      canvas.style.height = `${H}px`;
      build();
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      const sy = window.scrollY;
      dots.forEach((d) => {
        let fx = 0;
        let fy = 0;
        const mdx = d.x - mouse.x;
        const mdy = d.y - sy - mouse.y;
        const md = Math.hypot(mdx, mdy);
        if (md < 80) {
          const f = (1 - md / 80) * 2.5;
          fx += (mdx / (md + 1)) * f;
          fy += (mdy / (md + 1)) * f;
        }
        ripples.forEach((r) => {
          const age = now - r.t;
          const ring = age * 0.28;
          const rdx = d.x - r.x;
          const rdy = d.y - r.y;
          const rd = Math.hypot(rdx, rdy);
          const diff = Math.abs(rd - ring);
          if (diff < 36) {
            const amp = (1 - diff / 36) * Math.exp(-age / 700) * 5;
            fx += (rdx / (rd + 1)) * amp;
            fy += (rdy / (rd + 1)) * amp;
          }
        });
        fx += (d.ox - d.x) * 0.09;
        fy += (d.oy - d.y) * 0.09;
        d.vx = (d.vx + fx) * 0.72;
        d.vy = (d.vy + fy) * 0.72;
        d.x += d.vx;
        d.y += d.vy;
        const prox = Math.hypot(mdx, mdy);
        const boost = prox < 100 ? (1 - prox / 100) * 0.4 : 0;
        ctx.beginPath();
        ctx.arc(d.x, d.y - sy, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,164,53,${Math.min(1, d.op + boost)})`;
        ctx.fill();
      });
      ripples = ripples.filter((r) => now - r.t < 2200);
      raf = requestAnimationFrame(draw);
    };

    const onMouse = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onClick = (e: MouseEvent) => {
      ripples.push({ x: e.clientX, y: e.clientY + window.scrollY, t: performance.now() });
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("click", onClick);
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("click", onClick);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} id="dotcanvas" aria-hidden="true" />;
}
