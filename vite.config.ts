import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const readJsonBody = (req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });

function agentflowDevProxy(env: Record<string, string>): Plugin {
  return {
    name: "agentflow-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/agentflow", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const body = await readJsonBody(req);
          const baseUrl = env.AGENTFLOW_API_BASE_URL || env.VITE_AGENTFLOW_API_BASE_URL;
          const apiKey = env.AGENTFLOW_API_KEY || env.VITE_AGENTFLOW_API_KEY;
          const query = typeof body.query === "string" ? body.query.trim() : "";

          if (!baseUrl || !apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Agentflow environment variables are not configured" }));
            return;
          }

          if (!query) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "query is required" }));
            return;
          }

          const sessionResponse = await fetch(`${baseUrl}/chat/create_session`, {
            method: "POST",
            headers: {
              "X-API-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_name: `Fund monitoring - ${new Date().toISOString()}`,
            }),
          });

          if (!sessionResponse.ok) {
            res.statusCode = sessionResponse.status;
            res.end(await sessionResponse.text());
            return;
          }

          const sessionJson = await sessionResponse.json();
          const sessionId = sessionJson?.data?.session_id;

          if (!sessionId) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: "Agentflow session response did not include data.session_id" }));
            return;
          }

          const streamResponse = await fetch(`${baseUrl}/chat/stream_question`, {
            method: "POST",
            headers: {
              "X-API-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              session_id: sessionId,
            }),
          });

          if (!streamResponse.ok || !streamResponse.body) {
            res.statusCode = streamResponse.status || 502;
            res.end(await streamResponse.text());
            return;
          }

          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          });
          res.write(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`);

          const reader = streamResponse.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Agentflow request failed" }));
            return;
          }

          res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Agentflow stream failed" })}\n\n`);
          res.end();
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 4200,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), agentflowDevProxy(env), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
