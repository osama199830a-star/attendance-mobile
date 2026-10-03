# -*- coding: utf-8 -*-
"""ينسخ student_web إلى mobile/www ويحمّل مكتبة المسح داخل التطبيق (ليعمل المسح بدون إنترنت)"""
import os
import shutil
import sys
import urllib.request

for _st in (sys.stdout, sys.stderr):
    try:
        _st.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "student_web")
DST = os.path.join(HERE, "www")
LIB = "vendor/jsQR.js"
URLS = ["https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
        "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js"]


def download(dest):
    for u in URLS:
        try:
            data = urllib.request.urlopen(u, timeout=30).read()
            if len(data) > 30_000:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "wb") as f:
                    f.write(data)
                return True
        except Exception:
            continue
    return False


if __name__ == "__main__":
    if os.path.exists(DST):
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST, ignore=shutil.ignore_patterns("downloads", "install.html", "sw.js", "__pycache__"))
    dest = os.path.join(DST, *LIB.split("/"))
    if os.path.exists(dest) or download(dest):
        print("✅ مكتبة المسح مدمجة داخل التطبيق")
    else:
        print("⚠️ تعذّر تحميل مكتبة المسح (لا إنترنت؟) — سيحاول التطبيق تحميلها من الإنترنت وقت التشغيل")
    print("✅ تم تجهيز mobile/www")
