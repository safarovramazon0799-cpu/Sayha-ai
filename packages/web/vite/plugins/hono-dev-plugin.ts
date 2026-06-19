import type { Plugin, ViteDevServer } from "vite";

// Routes handled by the Hono API server
const API_PREFIXES = ["/api", "/legal", "/contract", "/promo", "/documents", "/telegram", "/consultations"];

function isApiRoute(url: string): boolean {
  return API_PREFIXES.some((p) => url.startsWith(p));
}

export default function honoDevPlugin(): Plugin {
  return {
    name: "hono-dev-server",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !isApiRoute(req.url)) return next();

        try {
          const request = await toWebRequest(req);
          const app = await loadApp(server);
          const response = await app.fetch(request);

          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            // Don't forward transfer-encoding — Node handles that
            if (key.toLowerCase() === "transfer-encoding") return;
            res.setHeader(key, value);
          });

          // ── Streaming response: pipe body chunk-by-chunk ──────────
          if (response.body) {
            const reader = response.body.getReader();
            const pump = async () => {
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) { res.end(); break; }
                  const ok = res.write(value);
                  // backpressure: wait for drain if needed
                  if (!ok) await new Promise<void>((r) => res.once("drain", r));
                }
              } catch {
                res.end();
              }
            };
            pump();
          } else {
            res.end();
          }
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error("[hono-dev]", err);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    },
  };
}

async function loadApp(server: ViteDevServer) {
  const mod = await server.ssrLoadModule("/src/api/index.ts");
  return mod.default;
}

function toWebRequest(req: import("http").IncomingMessage): Request {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (req as unknown as ReadableStream) : undefined,
    // @ts-expect-error duplex needed for streaming request bodies
    duplex: hasBody ? "half" : undefined,
  });
}
