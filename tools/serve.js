/**
 * ParsiChin — tiny static server for the RTL lab.
 *
 * Serves the repository root (so /demo, /src, /styles and the bundled fonts are
 * all reachable) on 0.0.0.0 so it also works behind a port-forwarding preview.
 *
 *   node tools/serve.js            # http://localhost:8080/
 *   PORT=9000 node tools/serve.js
 *
 * No dependencies, no build step.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".zip": "application/zip"
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || "/").split("?")[0]);
  if (rel === "/" || rel === "") rel = "/demo/index.html";
  if (rel.endsWith("/")) rel += "index.html";

  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) return send(res, 403, "forbidden");

  fs.readFile(file, (err, data) => {
    if (err) {
      return send(res, 404, "not found: " + rel + "\n\ntry /demo/ for the RTL lab\n");
    }
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ParsiChin RTL lab  →  http://localhost:${PORT}/`);
  console.log(`extension sources   →  http://localhost:${PORT}/src/`);
});
