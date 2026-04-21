"use client";

import React, { useEffect, useRef } from "react";

type ChipMandalaProps = {
  size?: number;
};

export function ChipMandala({ size = 460 }: ChipMandalaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    let t = 0;
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;

      for (let r = 70; r <= 200; r += 10) {
        const count = Math.floor(r * 0.5);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + t * 0.0003 * (r % 20 ? 1 : -1);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          const alpha = 0.2 + Math.sin(t * 0.002 + i * 0.3) * 0.3;
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,164,53,${Math.max(0.1, alpha)})`;
          ctx.fill();
        }
      }

      for (let s = 0; s < 8; s++) {
        const ang = (s * Math.PI) / 4 + t * 0.0005;
        for (let k = 0; k < 24; k++) {
          const d = 40 + k * 8;
          const x = cx + Math.cos(ang) * d;
          const y = cy + Math.sin(ang) * d;
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,164,53,${0.6 - k * 0.02})`;
          ctx.fill();
        }
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "#f5f0e6";
      ctx.strokeStyle = "#c8a435";
      ctx.lineWidth = 2;
      const cs = 64;
      ctx.fillRect(-cs, -cs, cs * 2, cs * 2);
      ctx.strokeRect(-cs, -cs, cs * 2, cs * 2);

      ctx.strokeStyle = "#c8a435";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const o = -cs + 16 + i * 14;
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(s * cs, o);
          ctx.lineTo(s * (cs + 10), o);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(o, s * cs);
          ctx.lineTo(o, s * (cs + 10));
          ctx.stroke();
        });
      }

      ctx.strokeStyle = "#c8a435";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(-36, -36, 72, 72);
      ctx.strokeRect(-20, -20, 40, 40);

      ctx.globalAlpha = 1;
      ctx.fillStyle = "#3a4a1a";
      ctx.font = "700 20px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AI", 0, 1);
      ctx.restore();

      t += 16;
      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [size]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
