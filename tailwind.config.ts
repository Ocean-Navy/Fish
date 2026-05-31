import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        fish: {
          primary: "#EAF7FF",
          secondary: "#8DB8D8",
          accent: "#12D8FF",
          aqua: "#22F0D2",
          gold: "#F8C66A",
          coral: "#FF5C98",
          purple: "#7C5CFF",
          success: "#73F7A7",
          navy950: "#020A1E",
          navy900: "#06152E",
          navy800: "#0A2346",
          surface: "#071A33",
          raised: "#0B2446",
          border: "#1E6C93"
        }
      },
      boxShadow: {
        glow: "0 0 36px rgba(18, 216, 255, 0.18)",
        harbor: "0 24px 80px rgba(0, 0, 0, 0.36)"
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};

export default config;
