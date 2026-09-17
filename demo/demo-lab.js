/**
 * ParsiChin — RTL lab controller.
 * Rebuilds the iframe URL from the controls, then renders the probe report that
 * the chat frame posts back (score, chips, per-probe table).
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const iframe = $("#chat");
  const score = $("#score");
  const tbody = $("#results tbody");
  const table = $("#results");

  let pending = false;
  let lastRows = [];

  /** The host the mock page pretends to be, per the "Host rule" select. */
  const HOSTS = { deepseek: "chat.deepseek.com", chatgpt: "chatgpt.com" };

  function buildUrl() {
    const params = new URLSearchParams({
      engine: $("#engine").value,
      ext: $("#ext").value,
      mode: $("#mode").value,
      hostile: $("#hostile").value,
      font: $("#font").value,
      site: $("#site").value,
      noroot: $("#container").value === "noroot" ? "1" : "0",
      coverage: $("#coverage").value
    });
    return "chat.html?" + params.toString();
  }

  function updateFrameBar() {
    $("#frame-url").textContent = HOSTS[$("#site").value] + "/a/chat/s/1  ·  mock page";
    $("#frame-note").textContent =
      "build: " + ($("#engine").value === "before" ? "before fix (v0.1.0)" : "after fix (v0.2.1)") +
      " · extension: " + ($("#ext").value === "off" ? "off" : "on") +
      " · css: " + ($("#hostile").value === "1" ? "hostile" : "friendly") +
      " · coverage: " + ($("#coverage").value === "all" ? "all sites" : "built-in list") +
      ($("#container").value === "noroot" ? " · no <main>" : "");
  }

  function reload() {
    pending = true;
    lastRows = [];
    score.innerHTML = '<span class="big">…</span>measuring the frame';
    tbody.innerHTML = "";
    updateFrameBar();
    setChips(null);
    iframe.src = buildUrl();
  }

  const ESC = (s) => String(s == null ? "-" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function setChips(stats, totals) {
    const chip = (id, label, value, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = "chip" + (cls ? " " + cls : "");
      el.innerHTML = label + " <b>" + ESC(value) + "</b>";
    };
    if (!stats || !totals) {
      chip("chip-total", "probes", "—");
      chip("chip-fail", "failing", "—");
      chip("chip-root", "scan root", "—");
      chip("chip-blocks", "blocks", "—");
      return;
    }
    chip("chip-total", "probes", totals.total);
    chip("chip-fail", "failing", totals.fails, totals.fails ? "bad" : "good");
    chip("chip-root", "scan root", stats.root || "—");
    chip("chip-blocks", "blocks", stats.blocks);
  }

  function render(data) {
    const fails = data.rows.filter((r) => r.verdict !== "pass");
    const total = data.rows.length;
    lastRows = data.rows;

    score.innerHTML =
      '<span class="big ' + (fails.length ? "bad" : "ok") + '">' + (total - fails.length) + "/" + total + "</span>" +
      "probes pass · build <strong>" +
      ESC(data.engine === "before" ? "v0.1.0 (before fix)" : "v0.2.1 (after fix)") + "</strong>" +
      " · extension <strong>" + (data.extOn ? "ON" : "OFF") + "</strong>" +
      " · mode <strong>" + ESC(data.applyMode) + "</strong>" +
      (data.engineStats
        ? '<br>engine: scan root <code>' + ESC(data.engineStats.root) + "</code>, decorated blocks <strong>" +
          ESC(data.engineStats.blocks) + "</strong> (persian " + ESC(data.engineStats.persian) +
          ", latin " + ESC(data.engineStats.mixed) + ", pinned " + ESC(data.engineStats.pinnedLtr) + ")"
        : "") +
      '<br><span class="note">' + (fails.length
        ? fails.length + " probe(s) not right-to-left: " + fails.slice(0, 6).map((r) => r.id).join(", ") +
          (fails.length > 6 ? " …" : "")
        : "every probe behaves as expected — switch Extension to OFF to see the raw page.") + "</span>";

    setChips(data.engineStats, { total, fails: fails.length });

    tbody.innerHTML = data.rows.map((r) => '\n      <tr class="' + (r.verdict === "pass" ? "pass" : "fail") + '">' +
      '\n        <td class="mono">' + ESC(r.id) + "</td>" +
      "\n        <td>" + ESC(r.expect) + "</td>" +
      '\n        <td class="mono">' + ESC(r.dirAttr) + "</td>" +
      '\n        <td class="mono">' + ESC(r.direction) + "</td>" +
      '\n        <td class="mono">' + ESC(r.textAlign) + "</td>" +
      '\n        <td class="mono">' + ESC(r.base) + "</td>" +
      '\n        <td class="mono">' + ESC(r.align) + "</td>" +
      '\n        <td class="mono">' + (r.lines ? ESC(r.lines.join("/")) : "-") + "</td>" +
      '\n        <td class="mono">' + ESC(r.marker) + "</td>" +
      '\n        <td class="mono">' + ESC(r.classes) + "</td>" +
      "\n        <td>" + ESC(r.verdict) + "</td>" +
      "\n      </tr>").join("");
  }

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "parsichin-lab") {
      pending = false;
      render(data);
    } else if (data.type === "parsichin-lab-error") {
      pending = false;
      score.innerHTML = '<span class="big bad">error</span>' + ESC(data.message);
      setChips(null);
    }
  });

  ["#engine", "#ext", "#mode", "#hostile", "#font", "#site", "#container", "#coverage"].forEach((sel) => {
    $(sel).addEventListener("change", reload);
  });
  $("#rerun").addEventListener("click", reload);

  /* Show only the failing probes — the fast way to see what changed. */
  function setFilter(mode) {
    table.classList.toggle("fail-only", mode === "fail");
    $("#filter-all").classList.toggle("active", mode !== "fail");
    $("#filter-fail").classList.toggle("active", mode === "fail");
  }
  $("#filter-all").addEventListener("click", () => setFilter("all"));
  $("#filter-fail").addEventListener("click", () => setFilter("fail"));

  /* Show the absolute download URLs: the preview runs behind a proxied host, so
     the full URL is what people need when a direct click is blocked. */
  (function showAbsoluteUrls() {
    const origin = location.origin;
    ["#dl-build-url", "#dl-zip-url", "#dl-patch-url", "#dl-commits-url", "#dl-commands-url"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = origin + el.textContent;
    });
    const hint = document.querySelector("#dl-hint");
    if (hint) {
      hint.innerHTML += ' The full download page is <a href="/download/">' + origin + "/download/</a>.";
    }
  })();

  reload();
  // Safety net: if the frame never reports back, say so instead of hanging.
  setTimeout(() => {
    if (pending) {
      score.innerHTML = '<span class="big bad">no report</span>the chat frame did not measure anything — check the console';
      setChips(null);
    }
  }, 8000);
})();
