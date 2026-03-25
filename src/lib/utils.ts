import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseHex(hex: string): [number, number, number] | null {
  const c = hex.replace("#", "");
  if (c.length < 6) return null;
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/**
 * Automatic text color for any theme:
 * - Dark mode  → always returns a light/bright color (readable on dark bg)
 * - Light mode → always returns a dark color (readable on light bg)
 *
 * If the original color is saturated (colorful), keeps the hue but adjusts brightness.
 * If it's gray/unsaturated, falls back to pure white or pure dark.
 */
export function darkSafeColor(hex: string, isDark: boolean): string {
  const rgb = parseHex(hex);
  if (!rgb) return isDark ? "#ffffff" : "#1b1b1f";
  const [r, g, b] = rgb;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
  const luminance = r * 0.299 + g * 0.587 + b * 0.114;

  // Color is "colorful" enough to keep its hue
  const isColorful = saturation > 0.25;

  if (isDark) {
    // Dark mode: text must be bright
    if (luminance > 180) return hex; // already bright enough
    if (!isColorful) return "#ffffff"; // gray → pure white
    // Boost colorful colors to be bright
    const target = 200;
    const boost = Math.max(0, target - luminance);
    const factor = 1 + boost / Math.max(luminance, 1);
    return `rgb(${Math.min(255, Math.round(r * factor))},${Math.min(255, Math.round(g * factor))},${Math.min(255, Math.round(b * factor))})`;
  } else {
    // Light mode: text must be dark
    if (luminance < 120) return hex; // already dark enough
    if (!isColorful) return "#1b1b1f"; // gray → pure dark
    // Darken colorful colors
    const target = 80;
    const factor = target / Math.max(luminance, 1);
    return `rgb(${Math.max(0, Math.round(r * factor))},${Math.max(0, Math.round(g * factor))},${Math.max(0, Math.round(b * factor))})`;
  }
}
