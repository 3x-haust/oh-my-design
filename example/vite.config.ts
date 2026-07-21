import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served as a GitHub Pages project site at https://3x-haust.github.io/oh-my-design/.
// The base is applied to asset URLs and exposed to the app via import.meta.env.BASE_URL.
export default defineConfig({
  base: "/oh-my-design/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        ko: resolve(__dirname, "ko/index.html"),
      },
    },
  },
});
