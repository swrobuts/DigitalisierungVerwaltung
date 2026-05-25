import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GH Pages braucht "/DigitalisierungVerwaltung/ue1/webformular/", VPS-Container braucht "/".
  // CI setzt VITE_BASE_PATH für GH Pages.
  base: process.env.VITE_BASE_PATH ?? "/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
});
