import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolut sti til denne app — undgår forkert root når en forældremappe har package-lock.json. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
