import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "NF Society — La plateforme de jeux du DAO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#251B9F",
          backgroundImage:
            "radial-gradient(ellipse at top right, rgba(255, 73, 27, 0.35), transparent 60%), radial-gradient(ellipse at bottom left, rgba(37, 27, 159, 0.8), transparent 55%)",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "64px 64px 0 64px",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "#FF491B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 900,
              color: "white",
            }}
          >
            N
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            NF Society
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            padding: "0 64px",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.6)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            La plateforme de jeux du DAO
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 84,
              fontWeight: 800,
              color: "white",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: 1000,
            }}
          >
            Joue, mise, gouverne — en CRC sur Gnosis
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 500,
              color: "rgba(255, 255, 255, 0.75)",
              marginTop: 8,
            }}
          >
            17 jeux on-chain · Payouts automatiques · 100% communautaire
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 64px 64px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 44,
            }}
          >
            <span>❌⭕</span>
            <span>♟️</span>
            <span>🎲</span>
            <span>🎡</span>
            <span>🟣</span>
            <span>💣</span>
            <span>🎟️</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 22px",
              borderRadius: 999,
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              fontSize: 22,
              fontWeight: 600,
              color: "white",
            }}
          >
            Powered by Gnosis · Circles
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
