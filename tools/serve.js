/**
 * ParsiChin — static server for the project: landing page, downloads, RTL lab.
 *
 * Serves the repository root (so /demo, /src, /styles and the bundled fonts are
 * all reachable) on 0.0.0.0 so it also works behind a port-forwarding preview.
 *
 *   node tools/serve.js            # http://localhost:8080/
 *   PORT=9000 node tools/serve.js
 *
 * Routes
 *   /                 overview page (pages.js)
 *   /download/        all bundles with size + checksum
 *   /site.css         the shared design system (demo/site-theme.css, read live)
 *   /demo/            the RTL lab
 *   everything else   served from the working tree
 *
 * No dependencies, no build step.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
let pages = require("./pages.js");

/**
 * Re-read pages.js when it changes, so editing the pages does not need a
 * restart (static files are read per request anyway).
 */
const PAGES_FILE = path.join(__dirname, "pages.js");
let pagesStamp = 0;
function freshPages() {
  try {
    const mtime = fs.statSync(PAGES_FILE).mtimeMs;
    if (mtime !== pagesStamp) {
      delete require.cache[require.resolve(PAGES_FILE)];
      pages = require(PAGES_FILE);
      pagesStamp = mtime;
    }
  } catch (e) { /* keep the loaded copy */ }
  return pages;
}

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

/** Files the server should push as a download rather than render. */
const ATTACHMENT_EXT = new Set([".zip", ".patch", ".tar", ".gz", ".tgz", ".7z"]);

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
  ".sh": "text/plain; charset=utf-8",
  ".zip": "application/zip"
};

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  }, extra || {}));
  res.end(body);
}

function sendHtml(res, status, html) {
  send(res, status, html, "text/html; charset=utf-8");
}

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  let rel = raw;

  if (rel === "/" || rel === "") return sendHtml(res, 200, freshPages().landing(pages.context()));
  if (rel === "/site.css") {
    return send(res, 200, freshPages().theme(), "text/css; charset=utf-8");
  }
  if (rel === "/download" || rel === "/download/" || rel === "/files" || rel === "/files/") {
    return sendHtml(res, 200, freshPages().downloads(pages.context()));
  }
  if (rel === "/lab" || rel === "/lab/") {
    return res.writeHead(302, { Location: "/demo/", "Cache-Control": "no-store" }).end();
  }
  if (rel === "/commits" || rel === "/commits/") {
    return sendHtml(res, 200, freshPages().downloads(pages.context()));
  }

  if (rel.endsWith("/")) rel += "index.html";

  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) return send(res, 403, "forbidden\n");

  fs.readFile(file, (err, data) => {
    if (err) {
      if (path.extname(file) === "") return sendHtml(res, 404, freshPages().notFound(raw, pages.context()));
      return send(res, 404, "not found: " + rel + "\n\ntry / for the overview, /demo/ for the RTL lab\n");
    }
    const ext = path.extname(file).toLowerCase();
    const headers = ATTACHMENT_EXT.has(ext)
      ? { "Content-Disposition": 'attachment; filename="' + path.basename(file) + '"' }
      : null;
    send(res, 200, data, MIME[ext] || "application/octet-stream", headers);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ParsiChin overview    →  http://localhost:${PORT}/`);
  console.log(`RTL lab               →  http://localhost:${PORT}/demo/`);
  console.log(`downloads             →  http://localhost:${PORT}/download/`);
  console.log(`extension sources     →  http://localhost:${PORT}/src/`);
});
