import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Testes unitarios (jsdom). Separado do vite.config.ts para nao carregar o plugin
// do TanStack Start/nitro nem o build mobile.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // src/server/** JA FOI excluido daqui, com a nota de que usava node:test.
    // Nao usava: o runner nativo nao resolve os imports relativos sem extensao
    // daqueles arquivos, entao aqueles testes nao rodavam em lugar nenhum --
    // nem no vitest, nem na CI, nem a mao. Agora rodam aqui.
    exclude: ["node_modules/**"],
    restoreMocks: true,
  },
});
