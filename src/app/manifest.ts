import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NF Society",
    short_name: "NF Society",
    description: "Multiplayer games, lotteries & gambling with CRC on Gnosis Chain.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ee",
    theme_color: "#251B9F",
    categories: ["games", "entertainment", "finance"],
    icons: [
      {
        src: "/nf-society-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/nf-society-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
