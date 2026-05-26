import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest mit jsdom + React-Plugin — nötig für die React-Komponenten-Tests
 * (Bearbeitungsstand, AntragHeader, DocSection). Pure-Function-Tests
 * (render.test.ts, field-coverage.test.ts) laufen weiter in dieser
 * Umgebung mit.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
});
