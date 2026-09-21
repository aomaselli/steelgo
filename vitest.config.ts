import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Testes unitarios (jsdom). Separado do vite.config.ts para nao carregar o plugin
// do TanStack Start/nitro nem o build mobile.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // src/server/**/__tests__ usa node:test (runner nativo), nao vitest
    exclude: ["node_modules/**", "src/server/**"],
    restoreMocks: true,
  },
});
