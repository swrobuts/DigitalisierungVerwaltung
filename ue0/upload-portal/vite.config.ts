import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Base-Path:
//   - GH Pages braucht /DigitalisierungVerwaltung/ue0/upload-portal/
//   - VPS-Container (upload.butscher.cloud, Domain-Root): /
// CI setzt VITE_BASE_PATH für GH Pages, Container-Build lässt leer → "/".
const BASE_PATH = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  plugins: [tailwindcss()],
  base: BASE_PATH,
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5174 },
});
