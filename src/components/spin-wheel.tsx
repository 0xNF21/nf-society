"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { SpinResult } from "@/lib/daily-shared";
import { SPIN_SEGMENTS } from "@/lib/daily-shared";

type Props = {
  result: SpinResult | null;
  onSpin: () => void;
  onComplete: () => void;
  spinning: boolean;
  locale: "fr" | "en";
};

const SEGMENT_COUNT = 8;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

export default function SpinWheel({ result, onSpin, onComplete, spinning, locale }: Props) {
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Draw wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;
    const center = size / 2;
    const radius = center - 10;

    ctx.clearRect(0, 0, size, size);

    SPIN_SEGMENTS.forEach((segment, i) => {
      const startAngle = (i * SEGMENT_ANGLE - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * SEGMENT_ANGLE - 90) * (Math.PI / 180);

      // Draw segment
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = segment.color;
      ctx.fill();

      // Border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      const midAngle = (startAngle + endAngle) / 2;
      const labelRadius = radius * 0.65;
      const labelX = center + labelRadius * Math.cos(midAngle);
      const labelY = center + labelRadius * Math.sin(midAngle);

      ctx.save();
      ctx.translate(labelX, labelY);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 2;
      ctx.fillText(segment.label, 0, 0);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(center, center, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#1b1b1f";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }, []);

  // Trigger spin animation
  useEffect(() => {
    if (!spinning || !result) return;

    setHasSpun(true);

    // Calculate target rotation
    // Segment 0 is at the top (12 o'clock position)
    // We want the winning segment to land under the pointer (at top)
    const targetSegmentCenter = result.segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const fullSpins = 5 * 360; // 5 full rotations
    // We rotate clockwise, so subtract the target angle from 360
    const targetRotation = fullSpins + (360 - targetSegmentCenter);

    setRotation(prev => prev + targetRotation);
  }, [spinning, result]);

  const handleTransitionEnd = useCallback(() => {
    if (!hasSpun) return;
    setTimeout(() => {
      setShowResult(true);
      onComplete();
    }, 300);
  }, [hasSpun, onComplete]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Pointer */}
      <div className="relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
          <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
            <path d="M12 28L0 0H24L12 28Z" fill="#1b1b1f" stroke="#fff" strokeWidth="1.5"/>
          </svg>
        </div>

        {/* Wheel */}
        <div
          ref={wheelRef}
          className="w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] rounded-full overflow-hidden border-4 border-ink/20 shadow-xl"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
              : "none",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Spin button */}
      {!hasSpun && (
        <button
          onClick={onSpin}
          disabled={spinning}
          className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
        >
          {locale === "fr" ? "Tourner !" : "Spin!"}
        </button>
      )}

      {/* Result display */}
      {showResult && result && (
        <div className={`text-center p-4 rounded-xl animate-bounce ${
          result.crcValue > 0 || result.xpValue > 0
            ? "bg-amber-100 text-amber-800"
            : result.type === "jackpot"
              ? "bg-gradient-to-r from-yellow-200 to-amber-200 text-amber-900"
              : "bg-ink/5 text-ink/60"
        }`}>
          <p className="text-xl font-bold">{result.label}</p>
          {result.crcValue > 0 && (
            <p className="text-sm mt-1">💰 +{result.crcValue} CRC</p>
          )}
          {result.xpValue > 0 && (
            <p className="text-sm mt-1">⭐ +{result.xpValue} XP</p>
          )}
          {result.type === "streak_x2" && (
            <p className="text-sm mt-1">🔥 {locale === "fr" ? "Double XP demain !" : "Double XP tomorrow!"}</p>
          )}
        </div>
      )}
    </div>
  );
}
