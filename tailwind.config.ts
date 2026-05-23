import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B1E3C",
        brandblue: "#1A5CFF",
        good: "#0D9B6C",
        amber: "#D97706",
        danger: "#DC2626",
        orange: "#EA580C",
        teal: "#0891B2",
        purple: "#7C3AED",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
