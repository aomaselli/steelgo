import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Testes unitarios (jsdom). Separado do vite.config.ts para nao carregar o plugin
// do TanStack Start/nitro nem o build mobile.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // src/server/verification/**/__tests__ usa node:test (runner nativo).
    //
    // ATENCAO: esse caminho NAO executa hoje. Nao ha tsx nem ts-node no projeto,
    // e `node --test` nao resolve os imports sem extensao do TypeScript --
    // ERR_MODULE_NOT_FOUND. Ou seja, os testes de driver-verification nunca
    // rodaram. Convertê-los e decisao a parte; ate la a exclusao fica so neles,
    // para nao quebrar a suite com os imports de node:test.
    //
    // src/server/toll/** roda sob vitest, junto com o resto.
    exclude: ["node_modules/**", "src/server/verification/**"],
    restoreMocks: true,
  },
});
