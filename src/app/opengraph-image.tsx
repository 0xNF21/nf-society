import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "NF Society — La plateforme de jeux du DAO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE = "https://nf-society.vercel.app";

export default async function OpengraphImage() {
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
        {/* Top row : logo gauche + emojis droite */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "48px 48px 0 48px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
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
          <div style={{ display: "flex", gap: 14, fontSize: 44 }}>
            <span>❌⭕</span>
            <span>♟️</span>
            <span>🎲</span>
            <span>🎡</span>
            <span>🟣</span>
            <span>💣</span>
            <span>🎟️</span>
          </div>
        </div>

        {/* Main content */}
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

        {/* Footer : logos partenaires a droite (colle au bas) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 48px 32px 48px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
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
              <span style={{ fontSize: 20, fontWeight: 600, color: "#251B9F" }}>Built on</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gnosisSrc} alt="Gnosis" width={60} height={60} />
              <div style={{ width: 1, height: 32, backgroundColor: "rgba(0,0,0,0.1)" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={circlesSrc} alt="Circles" width={180} height={54} style={{ objectFit: "contain" }} />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 22px 6px 6px",
                borderRadius: 999,
                backgroundColor: "white",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nfSrc} alt="NF Society" width={68} height={68} style={{ borderRadius: 999 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#251B9F", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Made by</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#251B9F" }}>NF Society</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
