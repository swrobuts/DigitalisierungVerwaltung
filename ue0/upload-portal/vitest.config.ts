import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests laufen mit deterministischen ENV-Werten, damit der API-Layer
  // nicht beim Modul-Load wegen fehlendem ANON_KEY abbricht.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://test.supabase"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
    "import.meta.env.VITE_UE1_URL": JSON.stringify("http://localhost:5173"),
    "import.meta.env.VITE_KLASSIFIZIERE_URL": JSON.stringify(
      "https://pruefung.test/api/klassifiziere-pdf",
    ),
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/__tests__/**/*.test.ts"],
  },
});
