/**
 * ParsiChin — HTML pages served by tools/serve.js.
 *
 * Everything visible here is English (the extension UI itself is localised).
 * The stylesheet lives in demo/site-theme.css and is served at /site.css so the
 * lab and the server pages share exactly one design system.
 *
 * No dependencies: pages are built as plain strings.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const THEME_FILE = path.join(ROOT, "demo", "site-theme.css");

/** Bundles offered for download. One list, used by the pages and the server. */
const BUNDLES = [
  {
    file: "dist/parsi-chin-v0.2.0.zip",
    label: "Extension build",
    tag: "install this",
    note: "The packaged extension itself. Unzip it, then chrome://extensions → Developer mode → Load unpacked.",
    kind: "build"
  },
  {
    file: "ParsiChin-v0.2.0.zip",
    label: "Project zip",
    tag: "everything",
    note: "Every project file: extension source, bundled fonts, docs, tests, the RTL lab and the audit tool.",
    kind: "project"
  },
  {
    file: "ParsiChin-v0.2.0.patch",
    label: "Changes patch",
    tag: "git am",
    note: "All commits as one git patch. Replays the complete fix onto the base commit.",
    kind: "patch"
  },
  {
    file: "COMMITS.txt",
    label: "Commit log",
    tag: "log",
    note: "Each commit with its hash, date, files and a description of what it changes.",
    kind: "log"
  },
  {
    file: "COMMANDS.md",
    label: "Copy-paste commands",
    tag: "how-to",
    note: "One block that downloads the files, applies the patch, runs the tests and starts the lab.",
    kind: "commands"
  },
  {
    file: "commit-all.sh",
    label: "Commit script",
    tag: "shell",
    note: "The git add / git commit commands for every change, in order, with short messages.",
    kind: "script"
  }
];

/* ------------------------------------------------------------------ helpers */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/** Size + short SHA-256 for a file in the repo (sha lets you verify a download). */
function fileInfo(rel) {
  const abs = path.join(ROOT, rel);
  try {
    const stat = fs.statSync(abs);
    const hash = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
    return { exists: true, size: stat.size, sizeText: humanSize(stat.size), sha: hash.slice(0, 12) };
  } catch (e) {
    return { exists: false, size: 0, sizeText: "missing", sha: "—" };
  }
}

let gitCache = { at: 0, value: null };

/** Branch / HEAD / commit count, read from git once every few seconds. */
function gitInfo() {
  const now = Date.now();
  if (gitCache.value && now - gitCache.at < 3000) return gitCache.value;
  const read = (cmd) => {
    try {
      return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch (e) {
      return "";
    }
  };
  const value = {
    branch: read("git rev-parse --abbrev-ref HEAD") || "unknown",
    head: read("git rev-parse --short HEAD") || "unknown",
    subject: read("git log -1 --pretty=%s") || "",
    date: read("git log -1 --pretty=%cd --date=format:%Y-%m-%d") || "",
    commits: read("git rev-list --count 9f5fa71..HEAD") || "0"
  };
  gitCache = { at: now, value };
  return value;
}

/** Everything the page builders need. */
function context() {
  return {
    git: gitInfo(),
    files: BUNDLES.map(function (b) {
      return Object.assign({}, b, fileInfo(b.file));
    })
  };
}

/** The shared stylesheet (read live, so editing it does not need a restart). */
function theme() {
  try {
    return fs.readFileSync(THEME_FILE, "utf8");
  } catch (e) {
    return "";
  }
}

/* ------------------------------------------------------------------- layout */

const NAV = [
  { href: "/", label: "Overview", key: "home" },
  { href: "/demo/", label: "RTL lab", key: "lab" },
  { href: "/download/", label: "Downloads", key: "download" },
  { href: "/ParsiChin-v0.2.0.zip", label: "Project zip", key: "zip" },
  { href: "https://github.com/aghrabooti/ParsiChin", label: "Repository", key: "repo" }
];

/** Client-side glue: copy buttons and absolute (proxied) URLs. */
const PAGE_SCRIPT = [
  "(function(){",
  "  var origin = location.origin;",
  "  document.querySelectorAll('[data-abs]').forEach(function(el){",
  "    el.textContent = origin + el.getAttribute('data-abs');",
  "  });",
  "  function copy(text, btn){",
  "    var done = function(){ var old = btn.textContent; btn.textContent = 'Copied';",
  "      setTimeout(function(){ btn.textContent = old; }, 1200); };",
  "    if (navigator.clipboard && navigator.clipboard.writeText) {",
  "      navigator.clipboard.writeText(text).then(done, function(){ done(); });",
  "    } else {",
  "      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);",
  "      ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done();",
  "    }",
  "  }",
  "  document.querySelectorAll('.cmd-head .copy').forEach(function(btn){",
  "    btn.addEventListener('click', function(){",
  "      var box = btn.closest('.cmd');",
  "      var pre = box && box.querySelector('pre');",
  "      if (pre) copy(pre.innerText, btn);",
  "    });",
  "  });",
  "  document.querySelectorAll('[data-copy]').forEach(function(btn){",
  "    btn.addEventListener('click', function(){ copy(origin + btn.getAttribute('data-copy'), btn); });",
  "  });",
  "})();"
].join("\n");

function layout(opts) {
  const git = opts.git || {};
  const active = opts.active || "";
  const nav = NAV.map(function (item) {
    const cls = item.key === active ? ' class="active"' : "";
    const ext = /^https?:/.test(item.href) ? ' target="_blank" rel="noopener"' : "";
    return '<a href="' + item.href + '"' + cls + ext + ">" + esc(item.label) + "</a>";
  }).join("");

  return "<!DOCTYPE html>\n" +
    '<html lang="en" dir="ltr">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>" + esc(opts.title) + "</title>\n" +
    '<link rel="stylesheet" href="/site.css">\n' +
    (opts.head || "") +
    "</head>\n<body>\n" +
    '<nav class="nav"><div class="nav-inner">' +
      '<span class="brand"><span class="brand-mark" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#04241f" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9a3 3 0 0 1 0 6H6"/>' +
        '<path d="m9 16 3 3-3 3" transform="translate(0,-4)"/></svg>' +
      '</span>' +
      '<span>ParsiChin<small>Persian RTL for AI chats</small></span></span>' +
      '<span class="nav-links">' + nav + "</span>" +
    "</div></nav>\n" +
    '<main class="wrap">\n' + opts.body + "\n</main>\n" +
    '<footer class="foot"><div class="wrap foot-inner">' +
      "<span>ParsiChin v0.2.0 · Chrome MV3 · MIT</span>" +
      '<span class="mono">' + esc(git.branch || "?") + " @ " + esc(git.head || "?") + "</span>" +
      "<span>" + esc(git.commits || "0") + " commits since the base</span>" +
      '<span class="mono">' + esc(git.date || "") + "</span>" +
      '<span style="margin-inline-start:auto">Served by <code>tools/serve.js</code> · files are read from the working tree</span>' +
    "</div></footer>\n" +
    "<script>\n" + PAGE_SCRIPT + "\n</script>\n" +
    "</body>\n</html>\n";
}

/** A command block with a copy button. */
function cmd(title, body) {
  return '<div class="cmd"><div class="cmd-head"><span>' + esc(title) + "</span>" +
    '<button class="copy" type="button">Copy</button></div>' +
    "<pre>" + esc(body) + "</pre></div>";
}

/* ------------------------------------------------------------------- pages */

const CAUSES = [
  {
    title: "The scan root could be missing entirely",
    body: "The content script only looked for containers named in the site rule. On a redesigned " +
      "page that matched nothing, so it scanned nothing and all you saw was the injected font. " +
      "There is now a fallback chain ending at <code>&lt;body&gt;</code>."
  },
  {
    title: "Direction was carried by a CSS class only",
    body: "A single class loses against a site rule with <code>!important</code> and higher " +
      "specificity. Blocks are now also given an inline <code>direction</code> with " +
      "<code>!important</code>, which no author stylesheet can override."
  },
  {
    title: "Whole containers were flipped, not text blocks",
    body: "Flipping a wrapper that mixes a Persian paragraph with an English one drags the English " +
      "text along. Direction is now decided per text block from its own characters, and " +
      "Latin-heavy blocks inside a Persian container are pinned back to LTR."
  },
  {
    title: "Line-by-line flip-flop",
    body: "With plain <code>dir=\"auto\"</code> every line resolves on its own, so a list with mixed " +
      "lines zig-zags. The direction is classified once per block instead."
  },
  {
    title: "List markers stayed on the left",
    body: "Bullets follow the <em>list</em> element, not the item. Persian items inside an LTR list " +
      "kept their markers on the wrong side; the list is now aligned with its items."
  },
  {
    title: "Site CSS was stronger than the fix",
    body: "Chat UIs ship rules like <code>direction: ltr !important</code> on their markdown wrapper. " +
      "Anything the extension sets must outrank that, or the page looks untouched."
  },
  {
    title: "Optional permissions were requested the wrong way",
    body: "The manifest declares <code>*://*/*</code>; asking Chrome for <code>&lt;all_urls&gt;</code> " +
      "throws <em>“Only permissions specified in the manifest may be requested.”</em> The origin " +
      "list now comes from one shared constant."
  }
];

const DIAGNOSE = [
  "Open the page where the text stays left-to-right.",
  "Click the ParsiChin toolbar icon — the popup reports how many blocks were decorated in that tab.",
  "If the count is 0 or lower than expected, run the report below in the page console and send the JSON."
].join("\n");

function landing(ctx) {
  const files = ctx.files.map(fileCard).join("\n");
  const causes = CAUSES.map(function (c, i) {
    return '<div class="card cause"><span class="num">' + (i + 1) + "</span><div><h3>" +
      esc(c.title) + "</h3><p>" + c.body + "</p></div></div>";
  }).join("\n");

  const body =
    '<section class="hero">\n' +
    '<span class="eyebrow">Chrome MV3 extension · v0.2.0 · working tree served live</span>\n' +
    "<h1>Persian text, right-aligned on every AI chat</h1>\n" +
    '<p class="lede">ParsiChin reads the characters of each text block and sets the direction that ' +
    "belongs there — Persian right-to-left, English left-to-right — without breaking either. " +
    "This page is the project's live server: the <strong>RTL lab</strong> runs the real content script " +
    "in a mock chat, and every deliverable is downloadable below.</p>\n" +
    '<div class="cta-row">' +
      '<a class="btn primary" href="/demo/">Open the RTL lab</a>' +
      '<a class="btn" href="/dist/parsi-chin-v0.2.0.zip" download>Download extension build</a>' +
      '<a class="btn" href="/download/">All files</a>' +
    "</div>\n" +
    '<div class="stats">' +
      '<div class="stat good"><b>0</b><span>failing probes after the fix</span></div>' +
      '<div class="stat bad"><b>22 → 0</b><span>before → after (audit)</span></div>' +
      '<div class="stat accent"><b>114</b><span>audit probes, 6 scenarios</span></div>' +
      '<div class="stat"><b>v0.2.0</b><span>extension build in <code>/dist</code></span></div>' +
    "</div>\n" +
    "</section>\n" +

    '<section class="sec" id="why">\n' +
    '<div class="sec-head"><h2>Why RTL kept failing</h2>' +
    '<span class="sec-sub">Seven defects, all reproduced in a headless browser before being fixed. ' +
    "The audit is <code>docs/rtl-audit.md</code>; the before/after dumps are the JSON files next to it.</span></div>\n" +
    '<div class="grid two">\n' + causes + "\n</div>\n" +
    "</section>\n" +

    '<section class="sec" id="files">\n' +
    '<div class="sec-head"><h2>Download from this server</h2>' +
    '<span class="sec-sub">The files are generated from the current commit and served straight from the ' +
    "working tree — sizes and checksums below are read when you load the page. " +
    'Full list: <a href="/download/">/download/</a>.</span></div>\n' +
    '<div class="files">\n' + files + "\n</div>\n" +
    "</section>\n" +

    '<section class="sec" id="start">\n' +
    '<div class="sec-head"><h2>Quick start</h2>' +
    '<span class="sec-sub">Two minutes: load the extension, then open the lab.</span></div>\n' +
    '<div class="grid two">\n' +
      '<div class="card"><h3>1 · Load the extension</h3>' +
        '<ol class="steps">' +
        "<li><strong>Download and unzip</strong> <code>dist/parsi-chin-v0.2.0.zip</code>.</li>" +
        "<li>Open <code>chrome://extensions</code> and switch on <strong>Developer mode</strong>.</li>" +
        "<li><strong>Load unpacked</strong> → pick the unzipped folder.</li>" +
        "<li>After every rebuild, click the <strong>⟳ reload</strong> button on the extension card and then " +
        "hard-reload the site (<code>Ctrl/Cmd+Shift+R</code>) — content scripts are not swapped into open tabs.</li>" +
        "</ol></div>\n" +
      '<div class="card"><h3>2 · Check the behaviour</h3>' +
        '<ol class="steps">' +
        "<li>Open <a href=\"/demo/\">the RTL lab</a> — every probe is measured in your browser.</li>" +
        "<li>Switch <em>Extension → OFF</em> to see the raw page, or <em>Build → before fix</em> for the v0.1.0 defects.</li>" +
        "<li><em>Site stylesheet → hostile</em> adds <code>direction: ltr !important</code>, the rule that used to win.</li>" +
        "<li><em>Container → redesigned</em> removes <code>&lt;main&gt;</code> — the shape of DeepSeek's current build.</li>" +
        "</ol></div>\n" +
    "</div>\n" +
    '<div class="grid two" style="margin-top:14px">\n' +
      cmd("Run the test suite + browser audit (from the project folder)",
        "npm install\nnpm test                 # smoke + UI sanity + permissions\nPC_CHROMIUM=/path/to/chromium npm run audit:rtl -- --strict") +
      cmd("Apply the changes to your own clone",
        "git checkout -b rtl-fix origin/main\ngit checkout bugfix-branch -- .   # or: git am ParsiChin-v0.2.0.patch\nbash commit-all.sh               # commits everything, short messages\nbash scripts/check.sh") +
    "</div>\n" +
    "</section>\n" +

    '<section class="sec" id="report">\n' +
    '<div class="sec-head"><h2>Still left-to-right somewhere?</h2>' +
    '<span class="sec-sub">The extension can tell you why, per page.</span></div>\n' +
    '<div class="grid two">\n' +
      '<div class="card"><h3>What to send</h3>' +
        '<ol class="steps">' + DIAGNOSE.split("\n").map(function (line) {
          return "<li>" + line + "</li>";
        }).join("") + "</ol></div>\n" +
      cmd("Page console, on the site that misbehaves",
        'copy(ParsiChin.reportJson())\n' +
        "// → settings, the scan root that was used, decorated blocks,\n" +
        "//   and every Persian block that was NOT decorated, with the reason.") +
    "</div>\n" +
    "</section>\n" +

    '<section class="sec" id="look">\n' +
    '<div class="sec-head"><h2>Where to look</h2></div>\n' +
    '<div class="card"><div class="grid three">' +
      linkCard("docs/rtl-audit.md", "The full audit: 6 scenarios, before/after numbers, the DeepSeek follow-up.") +
      linkCard("docs/rtl-audit-before.json", "Raw probe dump of the v0.1.0 snapshot (22 failing).") +
      linkCard("docs/rtl-audit-after.json", "Raw probe dump after the fix (0 failing).") +
      linkCard("README.md", "Install, options, scripts and how the direction engine works.") +
      linkCard("CHANGELOG.md", "Every fix, including the permission error and the DeepSeek report.") +
      linkCard("demo/legacy/", "The v0.1.0 content script kept around so the lab can prove the old defects.") +
    "</div></div>\n" +
    "</section>\n";

  return layout({ title: "ParsiChin — Persian RTL for AI chats", active: "home", body: body, git: ctx.git });
}

function linkCard(href, text) {
  return '<div><h3><a href="/' + esc(href) + '">' + esc(href) + "</a></h3>" +
    '<p class="note">' + text + "</p></div>";
}

function fileCard(f) {
  const tag = f.tag ? '<span class="tag">' + esc(f.tag) + "</span>" : "";
  const size = f.exists ? f.sizeText : "missing";
  const cls = f.kind === "build" ? "file primary-file" : "file";
  return '<div class="' + cls + '">' +
    '<div class="file-head"><h3>' + esc(f.label) + "</h3>" + tag + "</div>" +
    '<p><span class="path">' + esc(f.file) + "</span></p>" +
    "<p>" + esc(f.note) + "</p>" +
    '<div class="meta"><span>' + size + "</span><span>sha256 " + esc(f.sha) + "</span></div>" +
    '<div class="actions">' +
      '<a class="btn small primary" href="/' + esc(f.file) + '" download>Download</a>' +
      '<a class="btn small" href="/' + esc(f.file) + '" target="_blank" rel="noopener">Open</a>' +
      '<button class="btn small" type="button" data-copy="/' + esc(f.file) + '">Copy URL</button>' +
    "</div>" +
    "</div>";
}

function downloads(ctx) {
  const rows = ctx.files.map(function (f) {
    return "<tr>" +
      "<td><strong>" + esc(f.label) + "</strong><br><span class=\"path\">" + esc(f.file) + "</span></td>" +
      "<td>" + esc(f.note) + "</td>" +
      '<td class="mono">' + esc(f.sizeText) + "</td>" +
      '<td class="mono">' + esc(f.sha) + "</td>" +
      '<td><a class="btn small primary" href="/' + esc(f.file) + '" download>Download</a> ' +
      '<button class="btn small" type="button" data-copy="/' + esc(f.file) + '">Copy URL</button></td>' +
      "</tr>";
  }).join("\n");

  const cards = ctx.files.map(fileCard).join("\n");
  const absUrls = ctx.files.map(function (f) {
    return "<li><strong>" + esc(f.label) + "</strong><br>" +
      '<span class="mono" data-abs="/' + esc(f.file) + '">/' + esc(f.file) + "</span></li>";
  }).join("");

  const body =
    '<section class="hero" style="padding-bottom:6px">\n' +
    '<span class="eyebrow">Downloads</span>\n' +
    "<h1>Every deliverable, served from this box</h1>\n" +
    '<p class="lede">Sizes and checksums are read from the files on disk when the page loads. ' +
    "Nothing here is a placeholder — if a bundle were missing it would say so.</p>\n" +
    '<div class="cta-row">' +
      '<a class="btn primary" href="/dist/parsi-chin-v0.2.0.zip" download>Extension build</a>' +
      '<a class="btn" href="/ParsiChin-v0.2.0.zip" download>Project zip</a>' +
      '<a class="btn" href="/demo/">Back to the lab</a>' +
    "</div>\n" +
    "</section>\n" +

    '<section class="sec">\n' +
    '<div class="sec-head"><h2>Files</h2><span class="sec-sub">Click a card to download, or copy the URL ' +
    "and paste it wherever you need it.</span></div>\n" +
    '<div class="files">\n' + cards + "\n</div>\n" +
    "</section>\n" +

    '<section class="sec">\n' +
    '<div class="sec-head"><h2>Table view</h2><span class="sec-sub">The same six bundles with size and checksum.</span></div>\n' +
    '<div class="table-wrap"><table><thead><tr><th>File</th><th>What it is</th><th>Size</th><th>sha256 (12)</th><th>Get it</th></tr></thead>' +
    "<tbody>\n" + rows + "\n</tbody></table></div>\n" +
    '<p class="note" style="margin-top:10px">If a click opens the file instead of saving it, right-click → ' +
    "<em>Save link as…</em>, or use the <em>Copy URL</em> button and open it in a new tab.</p>\n" +
    "</section>\n" +

    '<section class="sec">\n' +
    '<div class="sec-head"><h2>Install the extension</h2></div>\n' +
    '<div class="grid two">\n' +
      '<div class="card"><ol class="steps">' +
        "<li>Download <code>dist/parsi-chin-v0.2.0.zip</code> and unzip it.</li>" +
        "<li><code>chrome://extensions</code> → <strong>Developer mode</strong> → <strong>Load unpacked</strong>.</li>" +
        "<li>Pick the unzipped folder (the one containing <code>manifest.json</code>).</li>" +
        "<li>Open a chat site, type Persian, and check the popup: it reports the decorated block count.</li>" +
      "</ol></div>\n" +
      '<div class="card"><h3>Direct URLs (this host)</h3>' +
        '<ul class="steps" style="list-style:none">' + absUrls + "</ul>" +
        '<p class="note">These are absolute, so they work when this server is reached through a proxy ' +
        "or a forwarded port.</p></div>\n" +
    "</div>\n" +
    "</section>\n";

  return layout({ title: "Downloads — ParsiChin", active: "download", body: body, git: ctx.git });
}

function notFound(pathname, ctx) {
  const body =
    '<section class="hero">\n<span class="eyebrow">404</span>\n' +
    "<h1>No such file on this server</h1>\n" +
    '<p class="lede">Nothing is served at <code>' + esc(pathname) + "</code>. " +
    "The project root is the working tree, so paths look like <code>/demo/index.html</code> or " +
    "<code>/dist/parsi-chin-v0.2.0.zip</code>.</p>\n" +
    '<div class="cta-row"><a class="btn primary" href="/">Overview</a>' +
    '<a class="btn" href="/demo/">RTL lab</a><a class="btn" href="/download/">Downloads</a></div>\n' +
    "</section>\n";
  return layout({ title: "404 — ParsiChin", active: "", body: body, git: ctx.git });
}

module.exports = { BUNDLES, context, theme, landing, downloads, notFound, layout, esc, cmd, humanSize };
