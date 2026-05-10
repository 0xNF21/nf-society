import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NF Society",
    short_name: "NF Society",
    description: "Arcade Free-to-Play du DAO NF Society: jeux en Fragments, gouvernance en CRC et rewards CRC.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ee",
    theme_color: "#251B9F",
    categories: ["games", "entertainment"],
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
