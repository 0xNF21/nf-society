"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ScratchResult } from "@/lib/daily-shared";
import { translations } from "@/lib/i18n";

type Props = {
  result: ScratchResult;
  onComplete: () => void;
  locale: "fr" | "en";
};

export default function ScratchCard({ result, onComplete, locale }: Props) {
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [scratching, setScratching] = useState<number | null>(null);
  const [complete, setComplete] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const scratchProgress = useRef<number[]>([0, 0, 0]);

  const CARD_SIZE = 100;
  const SCRATCH_RADIUS = 18;
  const REVEAL_THRESHOLD = 0.45;

  // Initialize canvas overlays
  useEffect(() => {
    canvasRefs.current.forEach((canvas, i) => {
      if (!canvas || revealed[i]) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = CARD_SIZE;
      canvas.height = CARD_SIZE;

      // Gray scratch overlay with subtle pattern
      ctx.fillStyle = "#9CA3AF";
      ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

      // Add some texture
      ctx.fillStyle = "#A1A1AA";
      for (let x = 0; x < CARD_SIZE; x += 8) {
        for (let y = 0; y < CARD_SIZE; y += 8) {
          if (Math.random() > 0.5) {
            ctx.fillRect(x, y, 4, 4);
          }
        }
      }

      // "Grattez" text
      ctx.fillStyle = "#E5E7EB";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(translations.daily.scratchAction[locale], CARD_SIZE / 2, CARD_SIZE / 2);
    });
  }, [locale, revealed]);

  const scratch = useCallback((cardIndex: number, clientX: number, clientY: number) => {
    const canvas = canvasRefs.current[cardIndex];
    if (!canvas || revealed[cardIndex]) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (CARD_SIZE / rect.width);
    const y = (clientY - rect.top) * (CARD_SIZE / rect.height);

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, SCRATCH_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Calculate progress
    const imageData = ctx.getImageData(0, 0, CARD_SIZE, CARD_SIZE);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++;
    }
    const progress = transparent / (CARD_SIZE * CARD_SIZE);
    scratchProgress.current[cardIndex] = progress;

    // Auto-reveal at threshold
    if (progress >= REVEAL_THRESHOLD && !revealed[cardIndex]) {
      const newRevealed = [...revealed];
      newRevealed[cardIndex] = true;
      setRevealed(newRevealed);

      // Check for match
      const revealedCount = newRevealed.filter(Boolean).length;
      if (revealedCount >= 2) {
        checkMatch(newRevealed);
      }
    }
  }, [revealed]);

  const checkMatch = useCallback((rev: boolean[]) => {
    const revealedSymbols = result.symbols.filter((_, i) => rev[i]);
    const hasPair = revealedSymbols.length >= 2 &&
      revealedSymbols.some((s, i) => revealedSymbols.indexOf(s) !== i);

    if (hasPair) {
      setMatchFound(true);
      // Reveal all
      setRevealed([true, true, true]);
      setTimeout(() => {
        setComplete(true);
        onComplete();
      }, 1500);
    } else if (rev.filter(Boolean).length === 3) {
      // All revealed, check final
      const allSymbols = result.symbols;
      const pair = allSymbols.some((s, i) => allSymbols.indexOf(s) !== i);
      setMatchFound(pair);
      setTimeout(() => {
        setComplete(true);
        onComplete();
      }, 1500);
    }
  }, [result.symbols, onComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent, i: number) => {
    if (scratching !== i) return;
    scratch(i, e.clientX, e.clientY);
  }, [scratching, scratch]);

  const handleTouchMove = useCallback((e: React.TouchEvent, i: number) => {
    e.preventDefault();
    const touch = e.touches[0];
    scratch(i, touch.clientX, touch.clientY);
  }, [scratch]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-4">
        {result.symbols.map((symbol, i) => (
          <div
            key={i}
            className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 overflow-hidden select-none
              ${revealed[i] ? "border-amber-400" : "border-ink/20"}
              ${matchFound && revealed[i] && result.symbols.filter(s => s === symbol).length >= 2
                ? "animate-bounce border-amber-400 shadow-lg shadow-amber-400/30"
                : ""
              }`}
          >
            {/* Symbol underneath */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100">
              <span className="text-4xl sm:text-5xl">{symbol}</span>
            </div>

            {/* Scratchable overlay */}
            {!revealed[i] && (
              <canvas
                ref={el => { canvasRefs.current[i] = el; }}
                className="absolute inset-0 w-full h-full cursor-pointer touch-none"
                onMouseDown={() => setScratching(i)}
                onMouseMove={(e) => handleMouseMove(e, i)}
                onMouseUp={() => setScratching(null)}
                onMouseLeave={() => setScratching(null)}
                onTouchStart={() => setScratching(i)}
                onTouchMove={(e) => handleTouchMove(e, i)}
                onTouchEnd={() => setScratching(null)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Result display */}
      {complete && (
        <div className={`text-center mt-2 p-3 rounded-xl ${
          result.crcValue > 0 || result.xpValue > 0
            ? "bg-amber-100 text-amber-800"
            : "bg-ink/5 text-ink/60"
        }`}>
          <p className="text-lg font-bold">{result.label}</p>
          {result.crcValue > 0 && (
            <p className="text-sm">💰 +{result.crcValue} CRC</p>
          )}
          {result.xpValue > 0 && (
            <p className="text-sm">⭐ +{result.xpValue} XP</p>
          )}
        </div>
      )}
    </div>
  );
}
