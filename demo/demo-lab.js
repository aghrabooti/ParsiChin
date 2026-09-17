/**
 * ParsiChin — RTL lab controller.
 * Rebuilds the iframe URL from the controls and renders the probe report that
 * the chat frame posts back.
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const iframe = $("#chat");
  const score = $("#score");
  const tbody = $("#results tbody");

  let pending = false;

  function buildUrl() {
    const params = new URLSearchParams({
      engine: $("#engine").value,
      ext: $("#ext").value,
      mode: $("#mode").value,
      hostile: $("#hostile").value,
      font: $("#font").value,
      site: $("#site").value
    });
    return "chat.html?" + params.toString();
  }

  function reload() {
    pending = true;
    score.innerHTML = "measuring…";
    tbody.innerHTML = "";
    iframe.src = buildUrl();
  }

  const ESC = (s) => String(s == null ? "-" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function render(data) {
    const fails = data.rows.filter((r) => r.verdict !== "pass");
    const total = data.rows.length;

    score.innerHTML =
      `<span class="big ${fails.length ? "bad" : "ok"}">${total - fails.length}/${total}</span>` +
      `probes pass · build <strong>${ESC(data.engine === "before" ? "v0.1.0 (before fix)" : "v0.2.0 (after fix)")}</strong>` +
      ` · extension <strong>${data.extOn ? "ON" : "OFF"}</strong>` +
      ` · mode <strong>${ESC(data.applyMode)}</strong>`;

    tbody.innerHTML = data.rows.map((r) => `
      <tr class="${r.verdict === "pass" ? "pass" : "fail"}">
        <td class="mono">${ESC(r.id)}</td>
        <td>${ESC(r.expect)}</td>
        <td class="mono">${ESC(r.dirAttr)}</td>
        <td class="mono">${ESC(r.direction)}</td>
        <td class="mono">${ESC(r.textAlign)}</td>
        <td class="mono">${ESC(r.base)}</td>
        <td class="mono">${ESC(r.align)}</td>
        <td class="mono">${r.lines ? ESC(r.lines.join("/")) : "-"}</td>
        <td class="mono">${ESC(r.marker)}</td>
        <td class="mono">${ESC(r.classes)}</td>
        <td>${ESC(r.verdict)}</td>
      </tr>`).join("");
  }

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "parsichin-lab") {
      pending = false;
      render(data);
    } else if (data.type === "parsichin-lab-error") {
      pending = false;
      score.innerHTML = `<span class="big bad">error</span>${ESC(data.message)}`;
    }
  });

  ["#engine", "#ext", "#mode", "#hostile", "#font", "#site"].forEach((sel) => {
    $(sel).addEventListener("change", reload);
  });
  $("#rerun").addEventListener("click", reload);

  /* Show the absolute download URLs (the preview runs on a proxied host, so the
     full URL is what people need if the direct click is blocked). */
  (function showAbsoluteUrls() {
    const origin = location.origin;
    ["#dl-build-url", "#dl-zip-url", "#dl-patch-url", "#dl-commits-url", "#dl-commands-url"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = origin + el.textContent;
    });
    const hint = document.querySelector("#dl-hint");
    if (hint) {
      hint.textContent += " The full download page is " + origin + "/download/";
    }
  })();

  reload();
  // Safety net: if the frame never reports back, say so instead of hanging.
  setTimeout(() => {
    if (pending) score.innerHTML = `<span class="big bad">no report</span>the chat frame did not measure anything (check the console)`;
  }, 6000);
})();
