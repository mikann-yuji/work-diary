import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "仕事上の傾向と対策",
    short_name: "仕事の記録",
    description: "毎日の勤務状況を穏やかに振り返るための記録アプリ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f7f6",
    theme_color: "#0f766e",
    orientation: "portrait",
    lang: "ja",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
