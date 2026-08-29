# نقشه‌ی راه ParsiChin — با کامیت‌های پیشنهادی

> ساختار فعلی طوری طراحی شده که فازبندی زیر **روی همان فایل‌ها** قابل انجام باشد
> و هر کامیت مستقل باشد. کامیت‌ها را پیشنهادی بگیرید؛ خودتان ترتیب و پیام‌ها را
> مطابق سلیقه‌تان تغییر دهید. بعد از هر فاز: `npm run check` و در صورت نیاز `npm test`.

## فاز ۰ — بستر (همین ساختار)

کامیت‌های پیشنهادی (به‌ترتیب؛ هر کدام را جداگانه بزنید):

1. **ساختار و مانیفست**
   ```
   git add manifest.json _locales assets/icons src/background src/shared
   git commit -m "feat: scaffold MV3 extension with shared settings & service worker"
   ```
2. **هسته‌ی شناسایی و اعمال**
   ```
   git add src/content/bidi.js src/content/rules.js src/content/entry.js styles/parsi-chin.css styles/fonts
   git commit -m "feat: bidi detection, per-site rules and live decoration of Persian text"
   ```
3. **رابط کاربری**
   ```
   git add src/popup src/options
   git commit -m "feat: popup with site status and full options page with live preview"
   ```
4. **ابزار توسعه و تست**
   ```
   git add scripts tests package.json README.md ROADMAP.md CONTRIBUTING.md LICENSE
   git commit -m "chore: build/check scripts, smoke tests and docs"
   ```

## فاز ۱ — ثبات (باید قبل از انتشار)

- [ ] تست روی ۵ سایت واقعی؛ ثبت مشکلات در `issues` (پوشه‌ی `docs/site-notes/` برای یادداشت هر سایت)
- [ ] حل تداخل با حالت‌های dark و RTL خود سایت‌ها
- [ ] `MutationObserver`: فقط تفاوت‌های واقعی را پردازش کند (already وجود دارد؛ performance test با پاسخ‌های بلند)
- [ ] در صورت کندی، `walk` را با انتخابگر مستقیم (فقط TEXT_BLOCK_TAGS + div/span دارای متن مستقیم) محدود کنید
- [ ] ثبت دقیق‌تر `root` هر سایت (الان `main` است؛ برای سایت‌هایی که محتوا خارج از `main` است اصلاح شود)

## فاز ۲ — قابلیت‌ها

- [ ] اسکن متن‌های داخل `iframe` (با `all_frames` و قواعد جدا)
- [ ] دکمه‌ی «اعمال روی این صفحه» با highlight بلوک‌های تغییرکرده
- [ ] فونت‌های فارسی جایگزین (Vazir، Estedad، IRANSans) با انتخاب در تنظیمات
- [ ] واژه‌نامه‌ی رفع ابهام: جداکننده‌ی کلمات فارسی/انگلیسی (ZWNJ) در فونت وزیرمتن
- [ ] عادی‌سازی علائم نگارشی قوی‌تر (؟ ! . و اعداد فارسی) پشت پرچم آزمایشی
- [ ] حالت «فقط متن کاربر» (تشخیص پیام‌های user vs assistant)

## فاز ۳ — انتشار

- [ ] صفحه‌ی `chrome://extensions` → آیکون و نام کامل (fa/en)
- [ ] آپلود در Chrome Web Store: توضیحات، اسکرین‌شات، سیاست حریم خصوصی (بدون جمع‌آوری داده)
- [ ] نسخه‌ی Firefox (MV3/WebExtensions، تفاوت `action` و `browser`)
- [ ] `git tag v0.2.0 && git push --tags` + انتشار در GitHub Releases با zip ساخته‌شده

## ایده‌های آینده

- OCR/انتخاب دستی بلوک توسط کاربر (راست‌کلیک → «پارسی‌چین روی این بلوک»)
- ترجمه‌ی درجا و نمایش دوگانه (فارسی + انگلیسی) برای پاسخ‌های انگلیسی
- تنظیمات همگام‌سازی با `chrome.storage.sync`
