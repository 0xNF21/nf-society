export type GameData = {
  game: string;
  id: string;
  v: number;
  t?: string;
};

const SUPPORTED_VERSIONS = [1];

export function encodeGameData(data: GameData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

export function decodeGameData(raw: string): GameData | null {
  try {
    let input = raw;
    if (input.startsWith("0x") || input.startsWith("0X")) {
      input = input.slice(2);
    }

    if (/^[0-9a-fA-F]+$/.test(input) && input.length > 0) {
      if (input.length % 2 !== 0) return null;
      const bytes = new Uint8Array(input.length / 2);
      for (let i = 0; i < input.length; i += 2) {
        bytes[i / 2] = parseInt(input.slice(i, i + 2), 16);
      }
      input = new TextDecoder().decode(bytes);
    }

    const parsed = JSON.parse(input);
    if (
      typeof parsed.game !== "string" || parsed.game.length === 0 ||
      typeof parsed.id !== "string" || parsed.id.length === 0 ||
      typeof parsed.v !== "number" || !Number.isInteger(parsed.v) ||
      !SUPPORTED_VERSIONS.includes(parsed.v)
    ) {
      return null;
    }
    const result: GameData = { game: parsed.game, id: parsed.id, v: parsed.v };
    if (typeof parsed.t === "string" && parsed.t.length > 0) result.t = parsed.t;
    return result;
  } catch {
    return null;
  }
}
