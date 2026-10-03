@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ═══ بناء تطبيق الأندرويد (APK) ═══
where node >nul 2>nul
if errorlevel 1 goto nonode
where java >nul 2>nul
if errorlevel 1 goto nojava
set "PY=python"
where python >nul 2>nul
if errorlevel 1 set "PY=py -3"

echo [1/6] تثبيت أدوات Capacitor...
call npm install
if errorlevel 1 goto fail
echo [2/6] تجهيز ملفات التطبيق...
%PY% prepare_www.py
if errorlevel 1 goto fail
if exist android goto hasandroid
echo [3/6] إنشاء مشروع أندرويد...
call npx cap add android
if errorlevel 1 goto fail
:hasandroid
echo [4/6] إعداد الكاميرا والاتصال...
%PY% patch_android.py
if errorlevel 1 goto fail
echo [5/6] مزامنة الملفات...
call npx cap sync android
if errorlevel 1 goto fail
echo [6/6] بناء APK (قد يستغرق عدة دقائق في أول مرة)...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 goto fail
cd ..
%PY% patch_android.py --apk
if errorlevel 1 goto fail
echo.
echo ✅ تم! انقل الملف AttendanceStudent.apk إلى الموبايل وثبّته.
pause
exit /b 0

:nonode
echo ❌ ثبّت Node.js (الإصدار 18 أو أحدث) من https://nodejs.org ثم أعد التشغيل
pause
exit /b 1
:nojava
echo ❌ ثبّت JDK 17 (مثلاً Temurin 17) وتأكد أن الأمر java يعمل ثم أعد التشغيل
pause
exit /b 1
:fail
echo.
echo ❌ فشلت إحدى الخطوات - اقرأ الرسالة أعلاه وأرسلها لي لأصلحها
pause
exit /b 1
