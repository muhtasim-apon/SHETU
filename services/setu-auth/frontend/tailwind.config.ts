import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "shetu-bg": "#08231F",
        "shetu-teal": "#0E7C66",
        "shetu-amber": "#F2A93B",
      },
    },
  },
  plugins: [],
};

export default config;
