import { defineConfig } from "vitest/config";

// environment="jsdom": Tests benötigen FormData/File-Objekte für die submit-Logik.
// Für reine Logik-Tests reichte "node", aber FormData ist in Node v20 nicht
// vorhanden (erst v22). jsdom bringt die DOM-APIs nativ mit.
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
