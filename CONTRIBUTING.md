# راهنمای مشارکت در ParsiChin

## قواعد معماری (مهم)

1. **بدون runtime dependency** — افزونه فقط از API مرورگر استفاده می‌کند. npm فقط برای ابزار تست است.
2. **بدون درخواست شبکه** — فونت وزیرمتن همراه افزونه است (`styles/fonts/`).
3. **اسکریپت‌های classic** — از ES modules استفاده نمی‌کنیم تا بارگذاری در `chrome.scripting` ساده بماند؛ هر فایل با IIFE و namespace سراسری `window.ParsiChin` کار می‌کند.
4. **فایل‌های shared باید side-effect-free باشند** (`defaults.js` فقط داده؛ `settings.js` فقط storage).
5. **همه‌چیز scoped** — استایل‌ها فقط زیر `.parsi-chin-active` / `.pc-block`؛ هیچ کلاسی بدون پیشوند `pc-` یا `parsi-chin-` اضافه نشود.
6. **همیشه LTR برای کد** — `pre/code/kbd` هرگز RTL نمی‌شوند (قابل غیرفعال‌سازی از تنظیمات).

## افزودن سایت جدید — چک‌لیست

1. `manifest.json` → `content_scripts[0].matches` (دامنه + مسیر)
2. `src/content/rules.js` → یک شیء با `id`، `name`، `sites`، `root` (ترجیحاً `main` یا انتخابگر باثبات)
3. `src/options/options.html` → (اختیاری) اگر می‌خواهید در تنظیمات دیده شود؛ فعلاً لیست خودکار از `rules.js` ساخته می‌شود
4. تست دستی + یادداشت در `docs/site-notes/`
5. `npm run check` → کامیت

## تست

```bash
npm install   # یک‌بار
npm test      # smoke test با jsdom (بدون مرورگر)
npm run check # syntax + JSON + فایل‌های لازم
```

برای تست‌های مرورگر (اختیاری): کروم را با `--load-extension` اجرا کنید
(یا از `chrome://extensions` → Load unpacked).

## کامیت

- پیام‌ها short و در قالب conventional: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- هر کامیت باید `npm run check` و `npm test` را پاس کند (برای تغییرات JS)
- کامیت‌های بزرگ را به کامیت‌های قابل بازگشت بشکنید؛ نقشه‌ی کامیت‌ها در `ROADMAP.md`
