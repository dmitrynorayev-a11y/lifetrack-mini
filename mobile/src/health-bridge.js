import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Health } from "@capgo/capacitor-health";
import { firstDay, normalizeDailySum, normalizeSleep, normalizeWorkouts } from "./health-logic.js";

// Runs inside the installed Capacitor app. Health records stay on this iPhone.
const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
window.VYRA_NATIVE = native;
window.dispatchEvent(new Event("vyra-native-ready"));

const KEY = "vyra-health-onboarding-v1";
const READ_SCOPES = ["steps", "sleep", "workouts", "distance"];
let inProgress = null;
let lastRequest = 0;

function note(message, type = "info") {
  window.dispatchEvent(new CustomEvent("vyra-health-status", {
    detail: { message, type, at: new Date().toISOString() }
  }));
}
function emit(payload) { window.dispatchEvent(new CustomEvent("vyra-health", { detail: payload })); }
function removeModal() { document.getElementById("vyra-health-modal")?.remove(); }

function openModal() {
  if (!native) {
    note("Системный доступ к Apple Здоровью работает только в установленном iOS-приложении.", "warning");
    return;
  }
  if (document.getElementById("vyra-health-modal")) return;
  const cover = document.createElement("div");
  cover.id = "vyra-health-modal";
  cover.setAttribute("role", "dialog");
  cover.setAttribute("aria-modal", "true");
  cover.setAttribute("aria-label", "Подключение Apple Здоровья");
  cover.innerHTML = [
    '<div class="vyra-health-card">',
    '<div class="vyra-heart">♥</div><div class="vyra-health-kicker">VYRA · СИНХРОНИЗАЦИЯ</div>',
    '<h2>Жизнь развивает героя</h2>',
    '<p class="vyra-health-explain">Подключи Apple Здоровье один раз. Шаги, сон и тренировки будут автоматически обновлять квесты и опыт.</p>',
    '<div class="vyra-health-list">',
    '<div>👟 <b>Шаги</b><span>Выносливость</span></div>',
    '<div>🌙 <b>Сон</b><span>Восстановление</span></div>',
    '<div>⚔️ <b>Тренировки</b><span>Сила</span></div>',
    '<div>🧭 <b>Дистанция</b><span>Путешествия</span></div></div>',
    '<div class="vyra-health-private">🔒 Только чтение. Ничего не записываем в Apple Здоровье. Данные остаются на твоём iPhone.</div>',
    '<button class="vyra-health-action" type="button" id="vyra-allow">Подключить Apple Здоровье</button>',
    '<button class="vyra-health-later" type="button" id="vyra-later">Не сейчас</button>',
    '</div>'
  ].join("");
  Object.assign(cover.style, {
    position:"fixed",inset:"0",zIndex:"999",background:"rgba(5,4,12,.88)",
    display:"grid",placeItems:"center",padding:"20px",overflowY:"auto",backdropFilter:"blur(12px)"
  });
  const style = document.createElement("style");
  style.textContent = [
    ".vyra-health-card{width:100%;max-width:450px;border:1px solid #ffc4884d;border-radius:27px;padding:25px 20px;text-align:center;background:radial-gradient(circle at 85% 0%,#52303e,transparent 54%),#211c2b;color:#fff;box-shadow:0 20px 70px #0009}",
    ".vyra-heart{font-size:57px;color:#ff6b95;text-shadow:0 0 30px #f5686d66}",
    ".vyra-health-kicker{font-size:11px;letter-spacing:2px;color:#ffb56f;font-weight:850;margin-top:4px}",
    ".vyra-health-card h2{font-size:28px;margin:13px 0 8px}",
    ".vyra-health-explain{font-size:14px;line-height:1.55;color:#cbbfcc}",
    ".vyra-health-list{margin:19px 0;border-radius:18px;background:#ffffff0b;text-align:left;overflow:hidden}",
    ".vyra-health-list div{display:flex;align-items:center;gap:10px;border-bottom:1px solid #ffffff16;padding:13px 16px}",
    ".vyra-health-list div:last-child{border:0}",
    ".vyra-health-list b{font-size:14px}",
    ".vyra-health-list span{font-size:11px;color:#a99faf;margin-left:auto}",
    ".vyra-health-private{font-size:12px;color:#bdb3c1;line-height:1.45;margin:15px 0}",
    ".vyra-health-action{width:100%;background:linear-gradient(110deg,#ffc47e,#ff805a);border:0;color:#231723;font-weight:900;padding:16px 10px;border-radius:15px;margin-top:4px}",
    ".vyra-health-later{width:100%;padding:14px;background:transparent;border:0;color:#c5b7c4}",
    ".vyra-health-action:disabled{opacity:.5}"
  ].join("\n");
  cover.appendChild(style);
  document.body.appendChild(cover);
  cover.querySelector("#vyra-later").onclick = () => {
    localStorage.setItem(KEY, "skipped");
    removeModal();
    note("Синхронизация пока не включена — включи её позднее в профиле.");
  };
  cover.querySelector("#vyra-allow").onclick = async () => {
    const btn = cover.querySelector("#vyra-allow");
    btn.disabled = true; btn.textContent = "Открываем разрешения iOS…";
    try {
      const available = await Health.isAvailable();
      if (!available.available) throw new Error("Apple Здоровье недоступно на этом устройстве");
      await Health.requestAuthorization({ read: READ_SCOPES, write: [] });
      // A successful iOS request does not confirm that read permissions were granted.
      localStorage.setItem(KEY, "requested");
      removeModal();
      await synchronize(true);
    } catch (e) {
      btn.disabled = false; btn.textContent = "Повторить подключение";
      note("Не получилось запросить доступ: " + String(e?.message || e), "error");
    }
  };
}

async function synchronize(force = false) {
  if (!native || localStorage.getItem(KEY) !== "requested") return;
  if (inProgress) return inProgress;
  if (!force && Date.now() - lastRequest < 90_000) return;
  lastRequest = Date.now();

  inProgress = (async () => {
    const from = firstDay(14).toISOString(), to = new Date().toISOString();
    const tasks = [
      Health.queryAggregated({dataType:"steps", startDate:from, endDate:to, bucket:"day", aggregation:"sum"}),
      Health.readSamples({dataType:"sleep", startDate:from, endDate:to, limit:1000}),
      Health.queryWorkouts({startDate:from, endDate:to, limit:250}),
      Health.queryAggregated({dataType:"distance", startDate:from, endDate:to, bucket:"day", aggregation:"sum"}),
    ];
    const [steps, sleep, workouts, distance] = await Promise.allSettled(tasks);
    const payload = {updatedAt:new Date().toISOString()}, errors = [];
    if (steps.status === "fulfilled") payload.steps = normalizeDailySum(steps.value.samples);
    else errors.push("шаги");
    if (sleep.status === "fulfilled") payload.sleep = normalizeSleep(sleep.value.samples);
    else errors.push("сон");
    if (workouts.status === "fulfilled") payload.workouts = normalizeWorkouts(workouts.value.workouts);
    else errors.push("тренировки");
    if (distance.status === "fulfilled") payload.distanceMeters = normalizeDailySum(distance.value.samples, 1000000);
    else errors.push("дистанция");

    const values = [payload.steps, payload.sleep, payload.workouts, payload.distanceMeters]
      .filter(Boolean).reduce((n, v) => n + Object.keys(v).length, 0);
    if (values > 0) {
      emit(payload);
      note(errors.length ? "Часть данных обновлена, недоступны: " + errors.join(", ") :
        "Apple Здоровье: показатели синхронизированы.", errors.length ? "warning" : "success");
    } else {
      note(errors.length === 4
        ? "Не удалось прочитать показатели. Попробуй ещё раз в профиле."
        : "Показателей пока нет. Проверь данные в Apple Здоровье и разрешения на чтение.", "warning");
    }
  })().catch(e => note("Ошибка синхронизации: " + String(e?.message || e), "error"))
    .finally(() => { inProgress = null; });
  return inProgress;
}

window.addEventListener("vyra-started", () => { if (native && !localStorage.getItem(KEY)) openModal(); });
window.addEventListener("vyra-health-connect-request", openModal);
window.addEventListener("vyra-health-sync-request", () => synchronize(true));
window.addEventListener("visibilitychange", () => { if (!document.hidden) synchronize(); });
if (native) {
  App.addListener("appStateChange", ({ isActive }) => { if (isActive) synchronize(); });
  setInterval(() => { if (!document.hidden) synchronize(); }, 120_000);
  const saved = (() => { try { return JSON.parse(localStorage.getItem("vyra-rpg-v1") || "{}") } catch { return {} } })();
  if (saved.started && !localStorage.getItem(KEY)) openModal();
  else if (localStorage.getItem(KEY) === "requested") synchronize(true);
}
