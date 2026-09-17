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

/** Files the server should push as a download rather than render. */
const ATTACHMENT_EXT = new Set([".zip", ".patch", ".tar", ".gz", ".tgz", ".7z"]);

/** Bundles offered on the /download page (built from the git history). */
const BUNDLES = [
  { file: "ParsiChin-v0.2.0.zip", label: "Project zip (v0.2.0)", note: "every project file: source, fonts, docs, tests, demo" },
  { file: "ParsiChin-v0.2.0.patch", label: "Changes patch", note: "git format-patch of all commits (apply with: git am)" },
  { file: "COMMITS.txt", label: "Commit log", note: "commit list with hashes and per-commit change description" },
  { file: "COMMANDS.md", label: "Copy-paste commands", note: "download, apply, test and run — one block" },
  { file: "commit-all.sh", label: "Commit commands", note: "the git add/commit commands for every change, in order" }
];

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

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  }, extra || {}));
  res.end(body);
}

/** A small HTML page listing the download bundles (also reachable at /download/). */
function downloadPage() {
  const rows = BUNDLES.map(function (b) {
    const file = path.join(ROOT, b.file);
    const exists = fs.existsSync(file);
    const size = exists ? (fs.statSync(file).size / 1024).toFixed(0) + " KB" : "missing";
    return "<tr>" +
      '<td><a href="/' + b.file + '" download>' + b.file + "</a></td>" +
      "<td>" + b.label + "</td>" +
      "<td>" + b.note + "</td>" +
      "<td>" + size + "</td>" +
      "</tr>";
  }).join("");

  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<title>ParsiChin downloads</title><style>" +
    "body{font:15px/1.6 'DejaVu Sans',Arial,sans-serif;margin:0;background:#eef2f7;color:#0f172a}" +
    "header{background:#0f172a;color:#e2e8f0;padding:18px 26px}header h1{margin:0;font-size:18px}" +
    "main{padding:22px 26px;max-width:1000px}table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden}" +
    "th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px}" +
    "th{background:#0f172a;color:#e2e8f0}td:first-child a{color:#0f766e;font-weight:600}" +
    "p.hint{font-size:13px;color:#475569}" +
    "</style></head><body><header><h1>ParsiChin — download the project files</h1></header>" +
    "<main><table><thead><tr><th>file</th><th>what it is</th><th>details</th><th>size</th></tr></thead>" +
    "<tbody>" + rows + "</tbody></table>" +
    "<p class=\"hint\">If a click opens the file instead of saving it, use right-click → “Save link as…”, " +
    "or open the URL directly in a new tab. The <a href=\"/demo/\">RTL lab</a> also links to these files.</p>" +
    "</main></body></html>";
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || "/").split("?")[0]);
  if (rel === "/download" || rel === "/download/" || rel === "/files" || rel === "/files/") {
    return send(res, 200, downloadPage(), "text/html; charset=utf-8");
  }
  if (rel === "/" || rel === "") rel = "/demo/index.html";
  if (rel.endsWith("/")) rel += "index.html";

  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) return send(res, 403, "forbidden");

  fs.readFile(file, (err, data) => {
    if (err) {
      return send(res, 404, "not found: " + rel + "\n\ntry /demo/ for the RTL lab\n");
    }
    const ext = path.extname(file).toLowerCase();
    const headers = ATTACHMENT_EXT.has(ext)
      ? { "Content-Disposition": 'attachment; filename="' + path.basename(file) + '"' }
      : null;
    send(res, 200, data, MIME[ext] || "application/octet-stream", headers);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ParsiChin RTL lab  →  http://localhost:${PORT}/`);
  console.log(`downloads          →  http://localhost:${PORT}/download/`);
  console.log(`extension sources   →  http://localhost:${PORT}/src/`);
});
