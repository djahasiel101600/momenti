// Production-style host for momenti: standalone Node server that serves the
// built frontend from dist/, the local API (/api/*) and uploaded media
// (/uploads/*) behind one port, with SPA fallback so deep links like
// /studio or /wedding-john-and-jane resolve to index.html.
//
//   npm run build   # emits dist/
//   npm run start   # -> http://localhost:8787  (MOMENTI_PORT overrides)
//
// For day-to-day development use `npm run dev`, which embeds the same API
// middleware into Vite.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { momentiMiddleware, DATA_DIR } from "./api.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOMENTI_PORT) || 8787;
const DIST_DIR = process.env.MOMENTI_DIST_DIR || path.join(__dirname, "..", "dist");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function serveFile(res, filePath, status = 200) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  res.writeHead(status, {
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function serveStaticOrNext(req, res) {
  // Only serve existing files out of dist; directories fall back to SPA.
  const urlPath = decodeURIComponent(new URL(req.url, "http://internal").pathname);
  const target = path.resolve(DIST_DIR, "." + urlPath.replace(/\/+$/, ""));
  if (target.startsWith(path.resolve(DIST_DIR) + path.sep) && fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if (stat.isFile() && serveFile(res, target)) return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  momentiMiddleware(req, res, () => {
    if (serveStaticOrNext(req, res)) return;
    // SPA fallback: every non-API route renders the React app.
    if (!serveFile(res, path.join(DIST_DIR, "index.html"))) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        "dist/ not found. Run `npm run build` first (or use `npm run dev`)."
      );
    }
  });
});

server.listen(PORT, () => {
  console.log(`[momenti] Server running at http://localhost:${PORT}`);
  console.log(`[momenti] Data dir: ${DATA_DIR}`);
});
