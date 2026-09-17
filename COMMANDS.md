# ParsiChin — copy-paste commands

One block, top to bottom. Everything is optional after step 2.

```bash
# ------------------------------------------------------------------
# 0) where the files come from (the live lab server / your preview URL)
# ------------------------------------------------------------------
SERVER="https://8080-i9ypi0phfm3z9us242b6d.e2b.app"
# running the lab on your own machine instead?  SERVER="http://localhost:8080"

# ------------------------------------------------------------------
# 1) download the three deliverables
# ------------------------------------------------------------------
curl -fL -o ParsiChin-v0.2.0.zip   "$SERVER/ParsiChin-v0.2.0.zip"
curl -fL -o ParsiChin-v0.2.0.patch "$SERVER/ParsiChin-v0.2.0.patch"
curl -fL -o COMMITS.txt            "$SERVER/COMMITS.txt"

# ------------------------------------------------------------------
# 2) sanity-check them
# ------------------------------------------------------------------
unzip -t ParsiChin-v0.2.0.zip | tail -2
echo "commits in patch: $(grep -c '^From ' ParsiChin-v0.2.0.patch)"
head -12 COMMITS.txt

# ------------------------------------------------------------------
# 3) unpack the whole project
# ------------------------------------------------------------------
unzip -o ParsiChin-v0.2.0.zip -d ParsiChin
cd ParsiChin

# ------------------------------------------------------------------
# 4) ...or get the same content from git
# ------------------------------------------------------------------
# git clone https://github.com/aghrabooti/ParsiChin.git
# cd ParsiChin
# git checkout arena/01a0b0f4-parsichin

# ------------------------------------------------------------------
# 5) ...or replay the changes onto main yourself
# ------------------------------------------------------------------
# git clone https://github.com/aghrabooti/ParsiChin.git && cd ParsiChin
# git checkout main && git checkout -b rtl-fix
# git -c user.name=me -c user.email=me@example.com am --3way ../ParsiChin-v0.2.0.patch

# ------------------------------------------------------------------
# 5b) or commit the changes yourself with short messages
# ------------------------------------------------------------------
# (see commit-all.sh — 5 groups, one commit each)
# git reset --soft 9f5fa71 && git reset     # keep the changes, drop the history
# bash commit-all.sh

# ------------------------------------------------------------------
# 6) install, test, build
# ------------------------------------------------------------------
npm install
npm test        # jsdom tests + one regression test per fixed RTL defect
npm run check   # JSON / JS syntax / required files
npm run build   # dist/parsi-chin-v0.2.0.zip  -> load unpacked in chrome://extensions

# ------------------------------------------------------------------
# 7) live RTL lab
# ------------------------------------------------------------------
npm run demo    # http://localhost:8080/   (downloads at /download/)

# ------------------------------------------------------------------
# 8) optional: real-browser RTL audit (needs a Chrome/Chromium binary)
# ------------------------------------------------------------------
npm i -D playwright-core
npx playwright install chromium
npm run audit:rtl -- --strict    # 95 probes, expect 0 failing
```

Notes

* If `curl` answers 401/403, the preview is private to your browser session: use the
  download cards on the lab page (`/download/`) instead — the files are the same.
* `manifest.json` version is `0.2.0`; the unpacked folder from step 3 can be loaded
  directly via chrome://extensions → Developer mode → Load unpacked.
* Patches are binary-safe (`git format-patch --binary`), so `git am` reproduces the
  screenshots in `docs/img/` byte for byte.
* `git am` needs a committer identity on a fresh machine; either set one
  (`git config user.name ...` / `git config user.email ...`) or use the
  `-c user.name=... -c user.email=...` form shown in step 5.
