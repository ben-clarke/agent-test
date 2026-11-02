import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEFAULT_API_URL = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keeps built files clear of the proxied /assets API path.
    assetsDir: "static",
  },
  server: {
    proxy: {
      "/assets": process.env.API_URL ?? DEFAULT_API_URL,
    },
  },
});
