import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  base: "/DigitalisierungVerwaltung/ue0/upload-portal/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5174 },
});
