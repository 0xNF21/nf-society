export function formatCrc(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
