import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral, Notion/Linear-leaning palette.
        border: "hsl(0 0% 90%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(0 0% 9%)",
        muted: "hsl(0 0% 96%)",
        "muted-foreground": "hsl(0 0% 45%)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
