import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolut sti til denne app — undgår forkert root når en forældremappe har package-lock.json. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  // Playbooks læses fra disk, når man taler med AI-sælgeren.
  outputFileTracingIncludes: {
    "/api/ai-saelger/samtale": ["./docs/ai-saelger/playbooks/**/*"],
    "/api/ai-saelger/traening/adrian": ["./docs/ai-saelger/playbooks/**/*"],
    "/api/ai-saelger/feedback-test": ["./docs/ai-saelger/playbooks/**/*"],
  },
};

export default nextConfig;
