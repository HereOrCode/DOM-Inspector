import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GH_PAGES_BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@hereorcode/dom-inspector": fileURLToPath(
        new URL("../../packages/dom-inspector/src/index.ts", import.meta.url)
      )
    }
  }
});
