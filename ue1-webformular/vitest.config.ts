import { defineConfig } from "vitest/config";

// environment="node": Alle Tests in dieser UE sind pure-Logik (Validation,
// Cross-Field-Regeln, i18n-Tabellen). Sie touchen weder DOM noch BOM-APIs.
// Wenn künftig DOM-touching Tests kommen, auf "jsdom" wechseln (+ jsdom als devDep).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
