import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "NF Society — La plateforme de jeux du DAO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE = "https://nf-society.vercel.app";

export default async function TwitterImage() {
  const [nfLogo, gnosisLogo, circlesLogo] = await Promise.all([
    fetch(`${SITE}/nf-society-logo.png`).then((r) => r.arrayBuffer()),
    fetch(`${SITE}/gnosis-logo.png`).then((r) => r.arrayBuffer()),
    fetch(`${SITE}/logo-color.png`).then((r) => r.arrayBuffer()),
  ]);
  const nfSrc = `data:image/png;base64,${Buffer.from(nfLogo).toString("base64")}`;
  const gnosisSrc = `data:image/png;base64,${Buffer.from(gnosisLogo).toString("base64")}`;
  const circlesSrc = `data:image/png;base64,${Buffer.from(circlesLogo).toString("base64")}`;

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={nfSrc} alt="NF Society" width={72} height={72} style={{ borderRadius: 18 }} />
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
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 64px 56px 64px",
          }}
        >
          <div style={{ display: "flex", gap: 14, fontSize: 44 }}>
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
              flexDirection: "column",
              gap: 14,
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 20px",
                borderRadius: 999,
                backgroundColor: "white",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 600, color: "#251B9F" }}>Built on</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gnosisSrc} alt="Gnosis" width={36} height={36} />
              <div style={{ width: 1, height: 24, backgroundColor: "rgba(0,0,0,0.1)" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={circlesSrc} alt="Circles" width={108} height={32} style={{ objectFit: "contain" }} />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 20px 10px 12px",
                borderRadius: 999,
                backgroundColor: "white",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nfSrc} alt="NF Society" width={40} height={40} style={{ borderRadius: 999 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#251B9F", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>Made by</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#251B9F" }}>NF Society</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
