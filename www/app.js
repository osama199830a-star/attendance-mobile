"use strict";
// ═════════ إعدادات ═════════
const JSQR_URLS = [                      // مكتبة القراءة الاحتياطية (للآيفون والمتصفحات بلا BarcodeDetector)
  "vendor/jsQR.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js",
];
const TOKEN_RE = /^Q\.[0-9A-F]+\.\d+\.[0-9A-F]+\.[0-9A-F]+$/i;     // صيغة باركود الحضور
const $ = (id) => document.getElementById(id);
let busy = false, pendingTicket = null, mem = {};
const cam = { stream: null, track: null, caps: {}, running: false, detector: null, canvas: null, ctx: null,
  n: 0, fails: 0, lastBad: 0, clearT: 0, torch: false, zoomIdx: 0 };

// ═════════ التخزين المحلي (مع بديل عند المنع) ═════════
function store(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); }
  catch (e) { if (val === undefined) return mem[key] || null; mem[key] = val; }
}
function getDeviceId() {
  let id = store("device_id");
  if (!id) {
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : "dev-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    store("device_id", id);
  }
  return id;
}
function getStudent() { try { return JSON.parse(store("student")); } catch (e) { return null; } }
function isNative() {                    // داخل تطبيق الأندرويد/الآيفون (Capacitor)
  return !!((window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    (location.hostname === "localhost" && /^(https|capacitor|ionic):$/.test(location.protocol)));
}
function needsServerAddress() {         // التطبيق أو فتح الملف مباشرة يحتاج عنوان السيرفر
  return (isNative() || location.protocol.indexOf("http") !== 0) && !store("api_base");
}
function apiBase() {
  if (window.API_BASE) return window.API_BASE;
  if (!isNative() && location.protocol.indexOf("http") === 0) return "";   // نفس عنوان السيرفر
  return store("api_base") || "";
}
function normalizeUrl(u) {
  u = (u || "").trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = "http://" + u;
  return u;
}
function openServerSettings() {
  $("f-server").value = store("api_base") || ""; $("server-error").textContent = "";
  $("btn-server-cancel").classList.toggle("hidden", !store("api_base"));
  showScreen("server");
}
async function saveServer() {
  const url = normalizeUrl($("f-server").value), err = $("server-error");
  if (!url) return (err.textContent = "أدخل عنوان السيرفر");
  err.textContent = "جارٍ فحص الاتصال..."; $("btn-server-save").disabled = true;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(url + "/api/info", { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) throw new Error("bad");
    await r.json();
  } catch (e) {
    err.textContent = "تعذّر الاتصال بهذا العنوان. تأكد من العنوان ومن أن الموبايل على نفس الشبكة";
    $("btn-server-save").disabled = false; return;
  }
  store("api_base", url); $("btn-server-save").disabled = false; err.textContent = "";
  loadInfo(); renderHome();
}

// ═════════ الشاشات ═════════
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
  window.scrollTo(0, 0);
}
function renderHome() {
  const st = getStudent(), box = $("student-info");
  if (st) {
    $("p-name").textContent = st.full_name;          // textContent لمنع حقن HTML
    $("p-group").textContent = "الكروب: " + st.group;
    $("avatar").textContent = (st.full_name || "؟").trim().charAt(0);
    box.classList.remove("hidden");
  } else box.classList.add("hidden");
  $("btn-server").classList.toggle("hidden", !(isNative() || location.protocol.indexOf("http") !== 0));
  showScreen("home");
}
function showSuccess(title, msg) {
  $("success-title").textContent = title; $("success-msg").textContent = msg || "";
  if (navigator.vibrate) navigator.vibrate(120);
  showScreen("success");
}
function showError(msg) { $("error-msg").textContent = msg; showScreen("error"); }
function setStatus(text, warn) { const p = $("scan-status"); p.textContent = text; p.classList.toggle("warn", !!warn); }

// ═════════ تحميل مكتبة القراءة الاحتياطية ═════════
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function ensureJsQR() {
  if (window.jsQR) return true;
  for (const u of JSQR_URLS) {
    try { await loadScript(u); if (window.jsQR) return true; } catch (e) {}
  }
  return false;
}

// ═════════ اسم الجامعة من السيرفر ═════════
async function loadInfo() {
  try {
    const r = await fetch(apiBase() + "/api/info", { cache: "no-store" });
    const d = await r.json();
    if (d.university_name) { $("uni-name").textContent = d.university_name; document.title = "الحضور - " + d.university_name; }
  } catch (e) {}
}

// ═════════ الاتصال بالسيرفر ═════════
async function postScan(payload) {
  try {
    const r = await fetch(apiBase() + "/api/attendance/scan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: getDeviceId(), ...payload }),
    });
    return await r.json();
  } catch (e) {
    return { status: "error", code: "network", message: "تعذّر الاتصال بالسيرفر، تأكد من الإنترنت" };
  }
}

// ═════════ الكاميرا والمسح الشامل ═════════
// يقرأ الباركود من أي مكان في الصورة وبأي زاوية/اتجاه، ويرسم مربعاً حوله مثل كاميرا الهاتف.
async function initDetector() {
  cam.detector = null;
  try {                                  // محرك المتصفح السريع (أندرويد/كروم/إيدج)
    if ("BarcodeDetector" in window) {
      const f = await BarcodeDetector.getSupportedFormats();
      if (f.indexOf("qr_code") >= 0) cam.detector = new BarcodeDetector({ formats: ["qr_code"] });
    }
  } catch (e) {}
}
function cameraErrorText(e) {
  const n = (e && e.name) || "";
  if (n === "NotAllowedError" || n === "SecurityError") return "تم رفض إذن الكاميرا. اسمح بها من إعدادات المتصفح ثم أعد المحاولة";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "لم أجد كاميرا في هذا الجهاز";
  if (n === "NotReadableError") return "الكاميرا مستخدمة من تطبيق آخر، أغلقه وأعد المحاولة";
  return "تعذّر تشغيل الكاميرا. تأكد أن الرابط يبدأ بـ https";
}
async function openCamera() {
  const tries = [
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false },
    { video: { facingMode: { ideal: "environment" } }, audio: false },
    { video: true, audio: false },
  ];
  let last = null; cam.stream = null;
  for (const c of tries) {
    try { cam.stream = await navigator.mediaDevices.getUserMedia(c); break; }
    catch (e) { last = e; if (e.name === "NotAllowedError" || e.name === "SecurityError") throw e; }
  }
  if (!cam.stream) throw last;
  const v = $("cam");
  v.srcObject = cam.stream; v.muted = true; v.setAttribute("playsinline", "");
  await v.play();
  cam.track = cam.stream.getVideoTracks()[0]; cam.caps = {};
  try {
    cam.caps = (cam.track.getCapabilities && cam.track.getCapabilities()) || {};
    if (cam.caps.focusMode && cam.caps.focusMode.indexOf("continuous") >= 0)
      await cam.track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });   // تركيز مستمر
  } catch (e) {}
  $("btn-torch").classList.toggle("hidden", !cam.caps.torch);
  $("btn-zoom").classList.toggle("hidden", !(cam.caps.zoom && cam.caps.zoom.max > cam.caps.zoom.min));
}
async function startScan() {
  showScreen("scan"); busy = false; cam.torch = false; cam.zoomIdx = 0; cam.fails = 0;
  $("btn-torch").classList.add("hidden"); $("btn-zoom").classList.add("hidden");
  setStatus("جارٍ تشغيل الكاميرا...");
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia))
    return showError("المتصفح لا يسمح بالكاميرا على هذا الرابط. افتح الرابط الذي يبدأ بـ https");
  await initDetector();
  if (!cam.detector && !(await ensureJsQR()))
    return showError("تعذّر تحميل مكتبة القراءة. تأكد من اتصالك بالإنترنت وأعد المحاولة");
  try { await openCamera(); } catch (e) { return showError(cameraErrorText(e)); }
  cam.running = true;
  setStatus("وجّه الكاميرا نحو الباركود");
  loop();
}
function stopScan() {
  cam.running = false;
  try { if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  cam.stream = null; cam.track = null;
  const v = $("cam"); try { v.srcObject = null; } catch (e) {}
  const cv = $("overlay"); try { cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); } catch (e) {}
}
function nextFrame(fn) {
  const v = $("cam");
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => fn());
  else setTimeout(fn, 16);
}
async function loop() {
  if (!cam.running) return;
  const v = $("cam");
  let hit = null;
  if (v.readyState >= 2 && v.videoWidth > 0) {
    try {
      hit = cam.detector ? await detectNative(v) : detectJs(v);
      cam.fails = 0;
    } catch (e) {
      if (cam.detector && ++cam.fails >= 3) { cam.detector = null; ensureJsQR(); }   // نتحول للمكتبة الاحتياطية
    }
  }
  if (hit && cam.running) onCode(hit);
  if (cam.running) nextFrame(loop);
}
async function detectNative(v) {
  const r = await cam.detector.detect(v);
  if (!r || !r.length) return null;
  const pick = r.find((c) => TOKEN_RE.test((c.rawValue || "").trim())) || r[0];
  return { text: pick.rawValue || "", pts: (pick.cornerPoints || []).map((p) => [p.x, p.y]) };
}
function detectJs(v) {
  if (!window.jsQR) return null;
  const vw = v.videoWidth, vh = v.videoHeight;
  const maxSide = (cam.n++ % 2 === 0) ? 960 : 1440;          // نبدّل الدقة: سريع للقريب، أدق للبعيد
  const s = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * s)), h = Math.max(1, Math.round(vh * s));
  if (!cam.canvas) { cam.canvas = document.createElement("canvas"); cam.ctx = cam.canvas.getContext("2d", { willReadFrequently: true }); }
  if (cam.canvas.width !== w) cam.canvas.width = w;
  if (cam.canvas.height !== h) cam.canvas.height = h;
  cam.ctx.drawImage(v, 0, 0, w, h);
  const img = cam.ctx.getImageData(0, 0, w, h);
  const r = window.jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
  if (!r || !r.data) return null;
  const L = r.location;
  const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => [p.x / s, p.y / s]);
  return { text: r.data, pts };
}
function drawBox(pts, good) {               // مربع حول الباركود مثل كاميرا الهاتف
  if (!pts || pts.length < 3) return;
  const cv = $("overlay"), v = $("cam");
  const dpr = window.devicePixelRatio || 1, cw = v.clientWidth, ch = v.clientHeight;
  if (!cw || !ch || !v.videoWidth) return;
  if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
  const s = Math.max(cw / v.videoWidth, ch / v.videoHeight);           // object-fit: cover
  const dx = (cw - v.videoWidth * s) / 2, dy = (ch - v.videoHeight * s) / 2;
  ctx.beginPath();
  pts.forEach((p, i) => { const x = p[0] * s + dx, y = p[1] * s + dy; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.strokeStyle = good ? "#34d27b" : "#ffb03c";
  ctx.fillStyle = good ? "rgba(52,210,123,.22)" : "rgba(255,176,60,.2)";
  ctx.fill(); ctx.stroke();
  clearTimeout(cam.clearT);
  cam.clearT = setTimeout(() => ctx.clearRect(0, 0, cw, ch), good ? 900 : 450);
}
async function adoptServerLink(text) {      // التطبيق: مسح رمز رابط الطلاب يضبط عنوان السيرفر تلقائياً
  let u; try { u = new URL(text); } catch (e) { return false; }
  const cands = [u.origin];
  if (u.protocol === "https:") cands.push("http://" + u.hostname + ":5000");      // شهادة ذاتية لا يقبلها التطبيق → http
  for (const c of cands) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(c + "/api/info", { signal: ctl.signal, cache: "no-store" });
      clearTimeout(t);
      if (r.ok) { store("api_base", c); loadInfo(); return true; }
    } catch (e) {}
  }
  return false;
}
function onCode(hit) {
  const text = (hit.text || "").trim(), good = TOKEN_RE.test(text);
  drawBox(hit.pts, good);
  if (busy) return;
  if (!good && isNative() && /^https?:\/\/\S+$/i.test(text)) {
    busy = true; setStatus("جارٍ ضبط عنوان السيرفر...");
    adoptServerLink(text).then((ok) => {
      setStatus(ok ? "✓ تم ضبط عنوان السيرفر، وجّه الكاميرا للباركود" : "تعذّر الاتصال بهذا السيرفر", !ok);
      setTimeout(() => { busy = false; setStatus("وجّه الكاميرا نحو الباركود"); }, 1500);
    });
    return;
  }
  if (!good) {                               // ليس باركود الحضور
    const now = Date.now();
    if (now - cam.lastBad > 1500) {
      cam.lastBad = now; setStatus("هذا ليس باركود الحضور", true);
      setTimeout(() => { if (!busy) setStatus("وجّه الكاميرا نحو الباركود"); }, 1400);
    }
    return;
  }
  busy = true;
  if (navigator.vibrate) navigator.vibrate(30);
  setStatus("جارٍ التحقق...");
  postScan({ token: text }).then((res) => handleResult(res, "scan"));
}
async function toggleTorch() {
  if (!cam.track) return;
  try { cam.torch = !cam.torch; await cam.track.applyConstraints({ advanced: [{ torch: cam.torch }] }); } catch (e) {}
}
async function cycleZoom() {
  const z = cam.caps && cam.caps.zoom; if (!cam.track || !z) return;
  const levels = [...new Set([z.min, Math.min(z.max, z.min * 2), Math.min(z.max, z.min * 3)])];
  cam.zoomIdx = (cam.zoomIdx + 1) % levels.length;
  try {
    await cam.track.applyConstraints({ advanced: [{ zoom: levels[cam.zoomIdx] }] });
    $("btn-zoom").textContent = "🔍 " + (levels[cam.zoomIdx] / z.min).toFixed(0) + "×";
  } catch (e) {}
}

// ═════════ معالجة الردود ═════════
function handleResult(res, from) {
  if (res.status === "ok" || res.status === "already") {
    if (res.student) store("student", JSON.stringify(res.student));
    stopScan();
    showSuccess(res.status === "ok" ? "تم تسجيل حضورك" : "مسجّل مسبقاً", res.message);
  } else if (res.status === "requires_registration") {
    pendingTicket = res.ticket;
    stopScan();
    $("reg-error").textContent = ""; $("btn-register").disabled = false;
    showScreen("register");
  } else if (from === "scan" && res.code === "token_expired") {
    setStatus("الباركود منتهي، وجّه الكاميرا للباركود الحالي", true);   // نكمل المسح دون إغلاق الكاميرا
    setTimeout(() => { busy = false; setStatus("وجّه الكاميرا نحو الباركود"); }, 700);
  } else if (from === "register" && ["validation", "name_exists", "duplicate"].indexOf(res.code) >= 0) {
    $("reg-error").textContent = res.message; $("btn-register").disabled = false;
  } else {
    stopScan();
    $("btn-register").disabled = false;
    showError(res.message || "حدث خطأ غير متوقع");
  }
}

async function submitRegister() {
  const full_name = $("f-name").value.trim().replace(/\s+/g, " ");
  const group = $("f-group").value.trim();
  const err = $("reg-error");
  if (full_name.split(" ").length < 4) return (err.textContent = "الاسم يجب أن يكون رباعياً (4 كلمات)");
  if (!group) return (err.textContent = "أدخل الكروب");
  err.textContent = "";
  $("btn-register").disabled = true;
  handleResult(await postScan({ ticket: pendingTicket, full_name, group }), "register");
}

// ═════════ الأحداث ═════════
$("btn-scan").onclick = startScan;
$("btn-server").onclick = openServerSettings;
$("btn-server-save").onclick = saveServer;
$("btn-server-cancel").onclick = renderHome;
$("btn-scan-cancel").onclick = () => { stopScan(); renderHome(); };
$("btn-torch").onclick = toggleTorch;
$("btn-zoom").onclick = cycleZoom;
$("btn-register").onclick = submitRegister;
$("btn-success-home").onclick = renderHome;
$("btn-error-home").onclick = renderHome;
$("btn-error-retry").onclick = startScan;
document.querySelectorAll("#screen-register input").forEach((i) =>
  i.addEventListener("keydown", (e) => { if (e.key === "Enter") submitRegister(); }));
document.addEventListener("visibilitychange", () => { if (document.hidden && cam.running) { stopScan(); renderHome(); } });

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0 && !isNative())
  navigator.serviceWorker.register("sw.js").catch(() => {});
if (needsServerAddress()) openServerSettings(); else renderHome();
loadInfo();
if (!("BarcodeDetector" in window)) ensureJsQR();      // تحميل مسبق ليبدأ المسح فوراً
