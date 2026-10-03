# -*- coding: utf-8 -*-
"""تعديلات ضرورية على مشروع أندرويد المولَّد (بعد: npx cap add android)
   python patch_android.py          → أذونات الكاميرا + السماح باتصال http + اسم التطبيق + مسار SDK
   python patch_android.py --apk    → نسخ ملف APK الناتج إلى مكان واضح"""
import glob
import os
import re
import shutil
import sys

for _st in (sys.stdout, sys.stderr):
    try:
        _st.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ANDROID = os.path.join(HERE, "android")
APP_NAME = "الحضور"


def patch():
    mf = os.path.join(ANDROID, "app", "src", "main", "AndroidManifest.xml")
    s = open(mf, encoding="utf-8").read()
    if "usesCleartextTraffic" not in s:
        s = s.replace("<application", '<application\n        android:usesCleartextTraffic="true"', 1)
    if "android.permission.CAMERA" not in s:
        s = s.replace("</manifest>", '    <uses-permission android:name="android.permission.CAMERA" />\n'
                      '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n'
                      '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />\n</manifest>', 1)
    open(mf, "w", encoding="utf-8").write(s)

    sx = os.path.join(ANDROID, "app", "src", "main", "res", "values", "strings.xml")
    if os.path.exists(sx):
        t = open(sx, encoding="utf-8").read()
        t = re.sub(r'(<string name="app_name">).*?(</string>)', r"\g<1>" + APP_NAME + r"\g<2>", t)
        t = re.sub(r'(<string name="title_activity_main">).*?(</string>)', r"\g<1>" + APP_NAME + r"\g<2>", t)
        open(sx, "w", encoding="utf-8").write(t)

    lp = os.path.join(ANDROID, "local.properties")
    if not os.path.exists(lp):
        sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or \
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk")
        if os.path.isdir(sdk):
            with open(lp, "w", encoding="utf-8") as f:
                f.write("sdk.dir=" + sdk.replace("\\", "/") + "\n")
            print("✅ SDK:", sdk)
        else:
            print("⚠️ لم أجد Android SDK. ثبّت Android Studio (يثبّت SDK تلقائياً) ثم أعد التشغيل.")
    print("✅ تم تجهيز مشروع أندرويد (كاميرا + اتصال http + اسم التطبيق)")


def copy_apk():
    found = glob.glob(os.path.join(ANDROID, "app", "build", "outputs", "apk", "debug", "*.apk"))
    if not found:
        print("❌ لم يظهر ملف APK. راجع رسائل الخطأ أعلاه.")
        sys.exit(1)
    root = os.path.abspath(os.path.join(HERE, ".."))
    out1 = os.path.join(root, "AttendanceStudent.apk")
    out2 = os.path.join(root, "student_web", "downloads", "AttendanceStudent.apk")
    os.makedirs(os.path.dirname(out2), exist_ok=True)
    shutil.copy(found[0], out1)
    shutil.copy(found[0], out2)
    print("✅ تم إنشاء:", out1)
    print("   (ونسخة في student_web/downloads ليحمّلها الطلاب من السيرفر: /install.html)")


if __name__ == "__main__":
    copy_apk() if "--apk" in sys.argv else patch()
