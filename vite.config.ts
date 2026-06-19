import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
              plugins: [
                              tailwindcss(),
                              tsconfigPaths(),
                              TanStackRouterVite({ autoCodeSplitting: true }),
                              tanstackStart(),
                              react(),
                            ],
});
