import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vite";

const dashboardDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(dashboardDir, "../..");
const envPath = resolve(projectRoot, ".env");
const dashboardEnvNames = new Set(["ADMIN_KEY", "GATEWAY_URL"]);
const env = existsSync(envPath)
  ? parse(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => {
          const assignment = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          return assignment !== null && dashboardEnvNames.has(assignment[1]);
        })
        .join("\n"),
    )
  : {};

export default defineConfig(({ command }) => {
  const adminKey = process.env.ADMIN_KEY ?? env.ADMIN_KEY;
  if (command === "serve" && !adminKey) {
    throw new Error("ADMIN_KEY must be configured in the root .env file for the dashboard proxy");
  }
  const gatewayUrl = process.env.GATEWAY_URL ?? env.GATEWAY_URL ?? "http://localhost:4002";
  const headers: Record<string, string> = {};
  if (adminKey) {
    headers["X-Admin-Key"] = adminKey;
  }
  const proxyOptions = {
    target: gatewayUrl,
    changeOrigin: true,
    headers,
  };

  return {
    root: dashboardDir,
    server: {
      proxy: {
        "/api/admin": {
          ...proxyOptions,
          rewrite: (path: string) => path.replace(/^\/api\/admin/, "/v1/admin"),
        },
        "/api/events": {
          ...proxyOptions,
          rewrite: () => "/v1/events",
        },
      },
    },
  };
});
