import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  base: "/DigitalisierungVerwaltung/ue1/webformular/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
});
