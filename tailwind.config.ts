import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b14",
          900: "#0b1220",
          850: "#101a2e",
          800: "#15223a",
          700: "#1d2f4d",
          600: "#2a3f63",
        },
        accent: "#38bdf8",
        danger: "#f43f5e",
        warn: "#f59e0b",
        ok: "#34d399",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
