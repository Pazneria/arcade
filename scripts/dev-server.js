const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PORT = Number(process.env.PORT || 5510);
const HOST = process.env.HOST || "127.0.0.1";
const LIVE_RELOAD_PATH = "/__arcade_live_reload";
const WATCH_IGNORE_PARTS = new Set([".git", "node_modules"]);
const MAX_PORT_ATTEMPTS = 20;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function shouldIgnorePath(relPath) {
  const normalized = String(relPath || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.some((part) => WATCH_IGNORE_PARTS.has(part));
}

function openBrowser(url) {
  spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

function normalizeUrlPath(urlPath) {
  if (!urlPath || urlPath === "/") return "/index.html";
  return decodeURIComponent(urlPath.split("?")[0]);
}

function getAbsoluteRequestPath(urlPath) {
  const normalized = normalizeUrlPath(urlPath);
  const candidate = path.resolve(ROOT_DIR, `.${normalized}`);
  if (!candidate.startsWith(ROOT_DIR)) return null;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return path.join(candidate, "index.html");
  }

  return candidate;
}

function getMimeType(absPath) {
  return MIME_TYPES[path.extname(absPath).toLowerCase()] || "application/octet-stream";
}

function createLiveReloadSnippet() {
  return `
<script>
(() => {
  if (window.__arcadeLiveReloadBound) return;
  window.__arcadeLiveReloadBound = true;
  const source = new EventSource("${LIVE_RELOAD_PATH}");
  source.addEventListener("reload", () => {
    window.location.reload();
  });
  source.addEventListener("error", () => {
    source.close();
    setTimeout(() => window.location.reload(), 900);
  });
})();
</script>`;
}

function injectLiveReload(html) {
  const snippet = createLiveReloadSnippet();
  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}\n</body>`);
  }
  return `${html}\n${snippet}`;
}

function createWatcher(onChange) {
  const watcher = fs.watch(ROOT_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (shouldIgnorePath(filename)) return;
    onChange({
      eventType,
      filename: String(filename).replace(/\\/g, "/")
    });
  });

  watcher.on("error", (error) => {
    console.error("Arcade watcher error:", error.message);
  });

  return watcher;
}

function listenWithFallback(server, { host, startingPort, onReady }) {
  const triedPorts = [];

  const attemptListen = (port) => {
    const handleError = (error) => {
      server.removeListener("listening", handleListening);

      const shouldTryNextPort =
        error &&
        (error.code === "EADDRINUSE" || error.code === "EACCES") &&
        triedPorts.length < MAX_PORT_ATTEMPTS;

      if (shouldTryNextPort) {
        const nextPort = port + 1;
        triedPorts.push(port);
        console.warn(`Port ${port} is busy, trying ${nextPort}...`);
        attemptListen(nextPort);
        return;
      }

      throw error;
    };

    const handleListening = () => {
      server.removeListener("error", handleError);
      onReady(port, triedPorts);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, host);
  };

  attemptListen(startingPort);
}

function startServer({ open = false } = {}) {
  const clients = new Set();
  let pendingReload = null;

  const broadcastReload = (payload) => {
    const body = `event: reload\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const response of clients) {
      response.write(body);
    }
  };

  const queueReload = (payload) => {
    if (pendingReload) clearTimeout(pendingReload);
    pendingReload = setTimeout(() => {
      pendingReload = null;
      broadcastReload(payload);
    }, 90);
  };

  const watcher = createWatcher((change) => {
    queueReload({
      changed: change.filename,
      eventType: change.eventType,
      at: Date.now()
    });
  });

  const server = http.createServer((request, response) => {
    const urlPath = request.url || "/";

    if (urlPath === LIVE_RELOAD_PATH) {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no"
      });
      response.write("\n");
      clients.add(response);
      request.on("close", () => {
        clients.delete(response);
      });
      return;
    }

    const absPath = getAbsoluteRequestPath(urlPath);
    if (!absPath || !fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const mimeType = getMimeType(absPath);
    if (mimeType.startsWith("text/html")) {
      const html = fs.readFileSync(absPath, "utf8");
      response.writeHead(200, { "Content-Type": mimeType, "Cache-Control": "no-store" });
      response.end(injectLiveReload(html));
      return;
    }

    response.writeHead(200, { "Content-Type": mimeType, "Cache-Control": "no-store" });
    fs.createReadStream(absPath).pipe(response);
  });

  listenWithFallback(server, {
    host: HOST,
    startingPort: DEFAULT_PORT,
    onReady: (port, triedPorts) => {
      const url = `http://localhost:${port}`;
      console.log(`Arcade dev server running at ${url}`);
      if (triedPorts.length > 0) {
        console.log(`Preferred port ${DEFAULT_PORT} was unavailable.`);
      }
      console.log("Live reload is enabled.");
      if (open) openBrowser(url);
    }
  });

  const shutdown = () => {
    watcher.close();
    server.close();
    for (const response of clients) {
      response.end();
    }
    clients.clear();
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}

const shouldOpen = process.argv.includes("--open");
startServer({ open: shouldOpen });
