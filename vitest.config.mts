import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * `.mts` sikrer at Vitest loader config som ESM og undgår
 * `ERR_REQUIRE_ESM` fra `std-env` under CJS config-load.
 */
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(dir, "./"),
    },
  },
});
