"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import type { SpinResult, SpinSegment } from "@/lib/daily-shared";
import { SPIN_SEGMENTS } from "@/lib/daily-shared";
import { translations } from "@/lib/i18n";
import { useStakeLabel } from "@/hooks/use-stake-label";

type Props = {
  result: SpinResult | null;
  onSpin: () => void;
  onComplete: () => void;
  spinning: boolean;
  locale: "fr" | "en";
  segments?: SpinSegment[];
};

export default function SpinWheel({ result, onSpin, onComplete, spinning, locale, segments = SPIN_SEGMENTS }: Props) {
  const { theme } = useTheme();
  const stake = useStakeLabel("daily");
  const isDark = theme === "dark";
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segmentCount = Math.max(segments.length, 1);
  const segmentAngle = 360 / segmentCount;

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

    segments.forEach((segment, index) => {
      const startAngle = (index * segmentAngle - 90) * (Math.PI / 180);
      const endAngle = ((index + 1) * segmentAngle - 90) * (Math.PI / 180);

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = segment.color;
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

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
      ctx.fillText(stake.t(segment.label).replace(/\bJACKPOT\b/g, "DOTATION"), 0, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 20, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? "#f5f5f5" : "#1b1b1f";
    ctx.fill();
    ctx.strokeStyle = isDark ? "#333" : "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [isDark, segmentAngle, segments, stake]);

  useEffect(() => {
    if (!spinning || !result) return;

    setShowResult(false);
    setHasSpun(true);

    const targetSegmentCenter = result.segmentIndex * segmentAngle + segmentAngle / 2;
    const fullSpins = 5 * 360;
    const targetRotation = fullSpins + (360 - targetSegmentCenter);

    setRotation((prev) => prev + targetRotation);
  }, [spinning, result, segmentAngle]);

  const handleTransitionEnd = useCallback(() => {
    if (!hasSpun) return;
    setTimeout(() => {
      setShowResult(true);
      onComplete();
    }, 300);
  }, [hasSpun, onComplete]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
          <svg width="24" height="28" viewBox="0 0 24 28" fill="none" aria-hidden="true">
            <path d="M12 28L0 0H24L12 28Z" fill={isDark ? "#f5f5f5" : "#1b1b1f"} stroke={isDark ? "#333" : "#fff"} strokeWidth="1.5" />
          </svg>
        </div>

        <div
          className="h-[280px] w-[280px] overflow-hidden rounded-full border-4 border-ink/20 shadow-xl sm:h-[300px] sm:w-[300px]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
              : "none",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
      </div>

      {!hasSpun && (
        <button
          type="button"
          onClick={onSpin}
          disabled={spinning}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
        >
          {translations.daily.spinButton[locale]}
        </button>
      )}

      {showResult && result && (
        <div className={`animate-bounce rounded-xl p-4 text-center ${
          result.crcValue > 0 || result.xpValue > 0
            ? "bg-amber-100 text-amber-800"
            : "bg-ink/5 text-ink/60"
        }`}>
          <p className="text-xl font-bold">{stake.t(result.label).replace(/\bJACKPOT\b/g, "DOTATION")}</p>
          {result.crcValue > 0 && (
            <p className="mt-1 text-sm">+{stake.format(result.crcValue)}</p>
          )}
          {result.xpValue > 0 && (
            <p className="mt-1 text-sm">+{result.xpValue} XP de solde</p>
          )}
        </div>
      )}
    </div>
  );
}
