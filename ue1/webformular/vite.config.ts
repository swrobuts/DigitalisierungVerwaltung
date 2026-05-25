import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/DigitalisierungVerwaltung/ue1/webformular/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
});
