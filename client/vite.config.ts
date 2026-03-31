import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** FastAPI (uvicorn) — kitchen + voice; all `/api/*` on one port (default 8000). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.join(__dirname), "");
  const port = env.VITE_KELLNER_API_PORT || "8000";
  const target = `http://127.0.0.1:${port}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api/ws": {
          target,
          changeOrigin: true,
          ws: true,
        },
        "/api": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
