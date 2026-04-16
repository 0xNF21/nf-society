export type GameData = {
  game: string;
  id: string;
  v: number;
  t?: string;
  bv?: number; // ball value (Plinko: CRC per ball)
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

    // Try hex decode first (legacy format: 0x7b2267616d65...)
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

    // Try JSON format: {"game":"morpion","id":"K7PCE2","v":1,"t":"abc"}
    try {
      const parsed = JSON.parse(input);
      if (
        typeof parsed.game === "string" && parsed.game.length > 0 &&
        typeof parsed.id === "string" && parsed.id.length > 0 &&
        typeof parsed.v === "number" && Number.isInteger(parsed.v) &&
        SUPPORTED_VERSIONS.includes(parsed.v)
      ) {
        const result: GameData = { game: parsed.game, id: parsed.id, v: parsed.v };
        if (typeof parsed.t === "string" && parsed.t.length > 0) result.t = parsed.t;
        if (typeof parsed.bv === "number" && parsed.bv > 0) result.bv = parsed.bv;
        return result;
      }
    } catch {
      // Not JSON, try text format below
    }

    // Try text format: "game:id[:token[:bv{N}]]"
    const parts = input.split(":");
    if (parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0) {
      const result: GameData = { game: parts[0], id: parts[1], v: 1 };
      if (parts[2] && parts[2].length > 0) result.t = parts[2];
      if (parts[3] && parts[3].startsWith("bv")) {
        const bv = parseFloat(parts[3].slice(2));
        if (!isNaN(bv) && bv > 0) result.bv = bv;
      }
      return result;
    }

    return null;
  } catch {
    return null;
  }
}
