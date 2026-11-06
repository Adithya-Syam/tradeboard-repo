import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e11",
        panel: "#151a21",
        line: "#232a33",
        muted: "#848e9c",
        up: "#0ecb81",
        down: "#f6465d",
        accent: "#f0b90b",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
