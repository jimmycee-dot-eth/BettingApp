import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0a0e17",
          900: "#0f1420",
          850: "#141b2b",
          800: "#1a2333",
          700: "#243044",
          600: "#334155",
        },
        arb: {
          DEFAULT: "#22c55e",
          soft: "#16351f",
        },
        accent: "#38bdf8",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
