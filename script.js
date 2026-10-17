/* =========================================================
   MediBridge AI — appointment prep, post-discharge safety
   guidance, and 30-day patient–doctor follow-up.
   No diagnosis. No medicine suggestions. Data stays local.
   ========================================================= */

/* ---------- helpers ---------- */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ENTITIES[character]);
}
const safe = escapeHTML;
const withBreaks = (value) => safe(value).replace(/\n/g, "<br>");

const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
const dayDiff = (a, b) => Math.round((a - b) / 86400000);
const niceDate = (key) =>
  parseKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    toast("Couldn't save on this browser 😕");
    return false;
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard ✅");
    if (button) {
      const original = button.textContent;
      button.textContent = "Copied!";
      setTimeout(() => (button.textContent = original), 1800);
    }
  } catch (error) {
    window.prompt("Copy your text using Ctrl+C:", text);
  }
}

function openEmailDraft(to, subject, body) {
  const MAX_BODY = 1800; // keeps the mailto link within what mail apps accept
  const trimmed =
    body.length > MAX_BODY
      ? body.slice(0, MAX_BODY) + "\n\n…(shortened — use Copy to get the full text)"
      : body;
  const address = EMAIL_RE.test((to || "").trim()) ? to.trim() : "";
  window.location.href =
    `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(trimmed)}`;
  toast("Opening your email app ✉️");
}

/* ---------- theme ---------- */
const themeToggle = $("#themeToggle");
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
}
applyTheme(
  storageGet("mb-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
);
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  storageSet("mb-theme", next);
});

/* ---------- tabs ---------- */
function switchTab(name, scroll = true) {
  $$(".tab-panel").forEach((panel) => (panel.hidden = panel.id !== `tab-${name}`));
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (scroll) $("#app").scrollIntoView({ behavior: "smooth", block: "start" });
}
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-tab]");
  if (trigger) switchTab(trigger.dataset.tab);
});

/* =========================================================
   1. APPOINTMENT PREP
   ========================================================= */
const healthForm = $("#healthForm");
const results = $("#results");

function makeQuestions(symptoms, duration, severity) {
  const questions = [
    "What could be causing these symptoms, and what should we consider?",
    "Are any examinations or tests appropriate?",
    "What changes or warning signs should I watch for?",
    "What are my treatment or self-care options?",
    "When should I arrange a follow-up appointment?"
  ];

  if (duration === "Recurring symptoms") {
    questions.push("Could there be a pattern or trigger behind these recurring symptoms?");
  }
  if (severity === "Severe") {
    questions.push("How urgently should I be assessed by a healthcare professional?");
  }
  if (/medication|medicine|drug/i.test(symptoms)) {
    questions.push("Could my current medicines be contributing to these symptoms?");
  }
  return questions;
}

function getSafetyMessage(severity) {
  if (severity === "Severe") {
    return "You selected severe symptoms. Consider prompt medical assessment. If symptoms are sudden, rapidly worsening, or feel life-threatening, seek emergency care now.";
  }
  return "This report does not assess medical urgency. If you have chest pain, difficulty breathing, sudden weakness, new confusion, uncontrolled bleeding, or another potentially life-threatening symptom, seek emergency care immediately.";
}

function formatReport(report) {
  return [
    "MEDIBRIDGE AI — APPOINTMENT PREPARATION REPORT",
    "",
    `Patient: ${report.name || "Not provided"}`,
    `Date: ${new Date().toLocaleDateString()}`,
    "",
    "SYMPTOM OVERVIEW",
    `Symptoms: ${report.symptoms}`,
    `Duration: ${report.duration}`,
    `Self-reported severity: ${report.severity}`,
    `Additional notes: ${report.notes || "None provided"}`,
    "",
    "QUESTIONS FOR THE DOCTOR",
    ...report.questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "SAFETY REMINDER",
    report.safety,
    "This tool does not diagnose conditions or replace professional medical advice."
  ].join("\n");
}

function buildReport(data) {
  const questions = makeQuestions(data.symptoms, data.duration, data.severity);
  const report = { ...data, questions, safety: getSafetyMessage(data.severity) };

  results.innerHTML = `
    <div class="report-heading">
      <span class="report-label">APPOINTMENT PREPARATION REPORT</span>
    </div>

    <section class="report-section">
      <h3>Patient details</h3>
      <p><strong>Name:</strong> ${safe(data.name || "Not provided")}</p>
      <p><strong>Prepared:</strong> ${safe(new Date().toLocaleDateString())}</p>
    </section>

    <section class="report-section">
      <h3>Symptom overview</h3>
      <p><strong>Reported symptoms:</strong><br>${withBreaks(data.symptoms)}</p>
      <p><strong>Duration:</strong> ${safe(data.duration)}</p>
      <p><strong>Self-reported severity:</strong> ${safe(data.severity)}</p>
      <p><strong>Additional notes:</strong><br>${withBreaks(data.notes || "None provided")}</p>
    </section>

    <section class="report-section">
      <h3>Questions to discuss with your doctor</h3>
      <ul>
        ${questions.map((question) => `<li>${safe(question)}</li>`).join("")}
      </ul>
    </section>

    <div class="report-safety">
      <strong>Safety reminder</strong><br>
      ${safe(report.safety)}
      This application does not diagnose conditions or replace professional medical advice.
    </div>

    <div class="action-row">
      <button type="button" class="action-button is-primary" id="copyReport">Copy Summary</button>
      <button type="button" class="action-button" id="emailReport">Email Draft ✉️</button>
      <button type="button" class="action-button" id="printReport">Print Report</button>
    </div>
  `;

  $("#copyReport").addEventListener("click", (event) => copyText(formatReport(report), event.currentTarget));
  $("#emailReport").addEventListener("click", () => {
    const tracker = storageGet(TRACKER_KEY, null);
    openEmailDraft(
      tracker && tracker.doctorEmail,
      "Appointment preparation — symptom summary",
      formatReport(report)
    );
  });
  $("#printReport").addEventListener("click", () => window.print());
}

healthForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = {
    name: $("#patientName").value.trim(),
    symptoms: $("#symptoms").value.trim(),
    duration: $("#duration").value,
    severity: $("#severity").value,
    notes: $("#notes").value.trim()
  };

  if (!data.symptoms || !data.duration || !data.severity) {
    toast("Please complete all required fields 🙏");
    return;
  }
  buildReport(data);
});

/* =========================================================
   2. POST-DISCHARGE SYMPTOM SUPPORT
   Rule-based safety triage only. It never names a condition
   and never suggests, doses or compares medicines.
   ========================================================= */
const dischargeForm = $("#dischargeForm");
const dischargeResults = $("#dischargeResults");
$("#dDate").max = toKey(startOfToday());

const LEVELS = [
  {
    cls: "lvl-0", emoji: "🟢", badge: "KEEP AN EYE ON IT",
    title: "Monitor and mention it to your care team",
    text: "What you selected is often reported after leaving hospital, but returning symptoms should still be reviewed. Let your care team know, and contact them if things don't settle or get worse."
  },
  {
    cls: "lvl-1", emoji: "🟡", badge: "CONTACT YOUR CARE TEAM",
    title: "Contact your doctor or hospital team soon",
    text: "Please get in touch with your care team in the next day or so, so they can decide whether you need to be seen. If anything gets worse in the meantime, move up to same-day advice."
  },
  {
    cls: "lvl-2", emoji: "🟠", badge: "SAME-DAY MEDICAL ADVICE",
    title: "Get medical advice today",
    text: "Some of what you selected can matter after a hospital stay. Contact your doctor, the discharging ward, or a local urgent care / nurse advice service today. If you can't reach anyone, go to an urgent care or emergency department."
  },
  {
    cls: "lvl-3", emoji: "🔴", badge: "EMERGENCY",
    title: "Seek emergency care now",
    text: "Please call your local emergency number or go to the nearest emergency department now. Don't wait for this app, and don't drive yourself if you feel faint or unwell."
  }
];

const EMERGENCY_WORDS =
  /chest pain|can'?t breathe|cannot breathe|shortness of breath|difficulty breathing|trouble breathing|unconscious|passed out|faint|heavy bleeding|bleeding (a lot|heavily|won'?t stop)|stroke|face droop|slurred speech|suicid|kill myself|end my life|seizure/i;

function assessDischarge({ symptoms, severity, other }) {
  let level = 0;
  symptoms.forEach((s) => (level = Math.max(level, s.level)));
  if (severity === "Moderate") level = Math.max(level, 1);
  if (severity === "Severe") level = Math.max(level, 2);
  if (EMERGENCY_WORDS.test(other)) level = 3;
  return level;
}

function formatDischargeReport(r) {
  return [
    "MEDIBRIDGE AI — POST-DISCHARGE SYMPTOM NOTE",
    "",
    `Patient: ${r.name || "Not provided"}`,
    `Hospital stay: ${r.reason || "Not provided"}`,
    `Discharge date: ${niceDate(r.date)} (${r.daysSince} day${r.daysSince === 1 ? "" : "s"} ago)`,
    `Self-reported severity: ${r.severity}`,
    "",
    "RETURNING SYMPTOMS",
    ...(r.symptoms.length ? r.symptoms.map((s) => `- ${s.label}`) : ["- None selected"]),
    `Details: ${r.other || "None provided"}`,
    "",
    `App guidance level: ${LEVELS[r.level].badge}`,
    "",
    "QUESTIONS FOR MY CARE TEAM",
    "1. Do these symptoms need me to be seen, and how soon?",
    "2. Are they connected to my hospital stay or treatment?",
    "3. What warning signs should send me back to hospital?",
    "4. Should I check with you or a pharmacist before taking anything for these symptoms?",
    "",
    "This note was prepared with MediBridge AI. It does not diagnose conditions or recommend medicines."
  ].join("\n");
}

function renderDischarge(r) {
  const lvl = LEVELS[r.level];
  const early = r.daysSince <= 30;

  dischargeResults.innerHTML = `
    <div class="level-card ${lvl.cls}">
      <span class="level-badge">${lvl.emoji} ${safe(lvl.badge)}</span>
      <h3>${safe(lvl.title)}</h3>
      <p>${safe(lvl.text)}</p>
    </div>

    <section class="report-section">
      <h3>Your discharge snapshot</h3>
      <p><strong>Discharged:</strong> ${safe(niceDate(r.date))} · ${r.daysSince} day${r.daysSince === 1 ? "" : "s"} ago</p>
      ${r.reason ? `<p><strong>Hospital stay:</strong> ${safe(r.reason)}</p>` : ""}
      <p><strong>Severity:</strong> ${safe(r.severity)}</p>
      <p><strong>Returning symptoms:</strong></p>
      <ul>${r.symptoms.length ? r.symptoms.map((s) => `<li>${safe(s.label)}</li>`).join("") : "<li>None selected</li>"}</ul>
      ${r.other ? `<p><strong>Details:</strong><br>${withBreaks(r.other)}</p>` : ""}
      ${early ? "<p>You're inside the first 30 days after discharge, when follow-up matters most. 💜</p>" : ""}
    </section>

    <section class="report-section">
      <h3>Safe next steps</h3>
      <ul>
        <li>Write down when each symptom started and whether it is getting better, worse, or staying the same.</li>
        <li>Keep your discharge papers and your list of current medicines nearby when you call.</li>
        <li>Follow the instructions your care team already gave you.</li>
        <li>Ask your doctor or pharmacist before taking anything new for these symptoms. This app can't tell you what is safe for you.</li>
        <li>Don't wait for a scheduled appointment if you are worried or things are changing quickly.</li>
      </ul>
    </section>

    <div class="report-safety">
      <strong>Safety reminder</strong><br>
      MediBridge AI doesn't diagnose conditions, guess causes, or suggest or compare medicines, because that could be dangerous.
      Call your local emergency number (e.g. 911, 999, 112, 1122) for chest pain, trouble breathing, sudden weakness or confusion,
      heavy bleeding, fainting, or any symptom that feels life-threatening.
    </div>

    <div class="action-row">
      <button type="button" class="action-button is-primary" id="dCopy">Copy for my doctor</button>
      <button type="button" class="action-button" id="dEmail">Email Draft ✉️</button>
      <button type="button" class="action-button" id="dPrint">Print</button>
      <button type="button" class="action-button is-danger" id="dTrack">Start 30-day tracking →</button>
    </div>
  `;

  $("#dCopy").addEventListener("click", (event) => copyText(formatDischargeReport(r), event.currentTarget));
  $("#dEmail").addEventListener("click", () => {
    const tracker = storageGet(TRACKER_KEY, null);
    openEmailDraft(
      tracker && tracker.doctorEmail,
      "Symptoms after hospital discharge — please advise",
      formatDischargeReport(r)
    );
  });
  $("#dPrint").addEventListener("click", () => window.print());
  $("#dTrack").addEventListener("click", () => {
    const state = loadTracker();
    state.startDate = r.date;
    if (r.name && !state.patientName) state.patientName = r.name;
    storageSet(TRACKER_KEY, state);
    fillSetupForm();
    renderTracker();
    switchTab("followup");
    toast("30-day tracker started 🚀");
  });
}

dischargeForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const date = $("#dDate").value;
  const severity = $("#dSeverity").value;
  const other = $("#dOther").value.trim();
  const symptoms = $$("#symptomChips input:checked").map((input) => ({
    label: input.value,
    level: Number(input.dataset.level)
  }));

  if (!date || !severity) {
    toast("Add your discharge date and severity 🙏");
    return;
  }
  if (!symptoms.length && !other) {
    toast("Pick at least one symptom or describe it ✍️");
    return;
  }

  const daysSince = dayDiff(startOfToday(), parseKey(date));
  if (daysSince < 0) {
    toast("Discharge date can't be in the future 📅");
    return;
  }

  const record = {
    name: $("#dName").value.trim(),
    reason: $("#dReason").value.trim(),
    date,
    daysSince,
    severity,
    symptoms,
    other
  };
  record.level = assessDischarge({ symptoms, severity, other });
  renderDischarge(record);
});

/* =========================================================
   3. 30-DAY PATIENT–DOCTOR FOLLOW-UP
   ========================================================= */
const TRACKER_KEY = "mb-tracker-v1";
const MOODS = ["", "Rough", "Meh", "Okay", "Good", "Great"];
const MOOD_EMOJI = ["", "😫", "😕", "😐", "🙂", "🤩"];
const WINDOW_DAYS = 30;

const setupForm = $("#setupForm");
const checkinForm = $("#checkinForm");
const trackerView = $("#trackerView");

function loadTracker() {
  const saved = storageGet(TRACKER_KEY, null);
  return {
    patientName: "",
    doctorName: "",
    doctorEmail: "",
    startDate: "",
    entries: {},
    ...(saved || {})
  };
}

function fillSetupForm() {
  const s = loadTracker();
  $("#fName").value = s.patientName;
  $("#fDoctor").value = s.doctorName;
  $("#fEmail").value = s.doctorEmail;
  $("#fStart").value = s.startDate;
  configureCheckinDate(s);
}

function configureCheckinDate(s) {
  const today = startOfToday();
  const input = $("#cDate");
  input.max = toKey(today);
  input.min = s.startDate || "";
  if (!input.value || input.value > input.max) input.value = toKey(today);
}

function trackerStats(s) {
  const keys = Object.keys(s.entries).sort();
  const entries = keys.map((k) => ({ key: k, ...s.entries[k] }));
  const today = startOfToday();
  const start = s.startDate ? parseKey(s.startDate) : null;
  const dayNumber = start ? dayDiff(today, start) + 1 : 0;

  const recent = entries.slice(-7);
  const avgPain = recent.length ? recent.reduce((t, e) => t + e.pain, 0) / recent.length : null;

  let trend = "—";
  if (entries.length >= 4) {
    const last3 = entries.slice(-3);
    const prev3 = entries.slice(-6, -3);
    if (prev3.length) {
      const a = last3.reduce((t, e) => t + e.pain, 0) / last3.length;
      const b = prev3.reduce((t, e) => t + e.pain, 0) / prev3.length;
      trend = a < b - 0.5 ? "Easing 📉" : a > b + 0.5 ? "Rising 📈" : "Steady ➡️";
    }
  }

  let streak = 0;
  const cursor = new Date(today);
  if (!s.entries[toKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (s.entries[toKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { entries, dayNumber, avgPain, trend, streak, latest: entries[entries.length - 1] };
}

function buildUpdateText(s) {
  const st = trackerStats(s);
  const last7 = st.entries.slice(-7);
  const dayLabel =
    st.dayNumber > WINDOW_DAYS ? `day ${st.dayNumber} (30-day window complete)` : `day ${Math.max(st.dayNumber, 1)} of ${WINDOW_DAYS}`;

  return [
    `Hello${s.doctorName ? " " + s.doctorName : ""},`,
    "",
    `This is my recovery update${s.patientName ? " — " + s.patientName : ""}.`,
    `Recovery start / discharge date: ${s.startDate ? niceDate(s.startDate) : "not set"} (${dayLabel}).`,
    `Check-ins logged: ${st.entries.length}` +
      (st.avgPain !== null ? ` · Average pain, last ${last7.length} check-ins: ${st.avgPain.toFixed(1)}/10` : "") +
      (st.trend !== "—" ? ` · Pain trend: ${st.trend.replace(/ [^\w\s]+$/u, "")}` : ""),
    "",
    "RECENT CHECK-INS",
    ...(last7.length
      ? last7.map(
          (e) =>
            `- ${niceDate(e.key)}: feeling ${MOODS[e.mood].toLowerCase()}, pain ${e.pain}/10, medicines: ${e.meds.toLowerCase()}` +
            (e.note ? ` — ${e.note.replace(/\s+/g, " ")}` : "")
        )
      : ["- No check-ins yet"]),
    "",
    "QUESTIONS",
    "1. Does this recovery pattern look as expected for me?",
    "2. Is there anything I should change, or any sign that means I should come in sooner?",
    "3. When would you like to see me next?",
    "",
    "Thank you,",
    s.patientName || "",
    "",
    "(Prepared with MediBridge AI — a tracking aid, not a diagnosis or medical advice.)"
  ].join("\n");
}

function renderTracker() {
  const s = loadTracker();

  if (!s.startDate) {
    trackerView.innerHTML = `
      <div class="empty-state">
        <span>🗓️</span>
        <p>Save your setup (start date + doctor) to unlock your 30-day dashboard.</p>
      </div>`;
    return;
  }

  const st = trackerStats(s);
  const today = startOfToday();
  const start = parseKey(s.startDate);
  const shownDay = Math.min(Math.max(st.dayNumber, 0), WINDOW_DAYS);
  const pct = Math.round((shownDay / WINDOW_DAYS) * 100);

  const cells = [];
  for (let i = 0; i < WINDOW_DAYS; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = toKey(day);
    const entry = s.entries[key];
    const isFuture = day > today;
    const isToday = key === toKey(today);
    let cls = "day";
    if (entry) cls += ` m${entry.mood}`;
    else if (isFuture) cls += " future";
    else cls += " missed";
    if (isToday) cls += " today";
    const title = `Day ${i + 1} · ${niceDate(key)}` + (entry ? ` · ${MOODS[entry.mood]}, pain ${entry.pain}/10` : "");
    cells.push(`<div class="${cls}" title="${safe(title)}">${i + 1}</div>`);
  }

  const latest = st.latest;
  const worried = latest && (latest.pain >= 8 || latest.mood === 1);

  const logItems = st.entries
    .slice(-6)
    .reverse()
    .map(
      (e) => `<li><b>${safe(niceDate(e.key))}</b> · ${MOOD_EMOJI[e.mood]} ${MOODS[e.mood]} · pain ${e.pain}/10 · ${safe(e.meds)}
        ${e.note ? `<br>${safe(e.note)}` : ""}</li>`
    )
    .join("");

  trackerView.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>${shownDay}/${WINDOW_DAYS}</b><span>Day</span></div>
      <div class="stat"><b>${st.streak} 🔥</b><span>Day streak</span></div>
      <div class="stat"><b>${st.avgPain === null ? "—" : st.avgPain.toFixed(1)}</b><span>Avg pain (7d)</span></div>
    </div>

    <div class="progress-wrap">
      <div class="progress-label"><span>Recovery window</span><span>${pct}%</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>

    ${st.dayNumber > WINDOW_DAYS ? '<p class="muted" style="margin-top:10px">🎉 Your 30-day window is complete. You can still log and send updates.</p>' : ""}
    ${st.dayNumber < 1 ? '<p class="muted" style="margin-top:10px">Your start date is in the future. Tracking begins on that day.</p>' : ""}

    <section class="report-section">
      <h3>Your 30 days</h3>
      <div class="day-grid">${cells.join("")}</div>
      <div class="legend">
        <span><i style="background:var(--red)"></i>Rough</span>
        <span><i style="background:var(--orange)"></i>Meh</span>
        <span><i style="background:var(--yellow)"></i>Okay</span>
        <span><i style="background:var(--lime)"></i>Good</span>
        <span><i style="background:var(--sky)"></i>Great</span>
      </div>
      <p>Pain trend: <strong>${safe(st.trend)}</strong> · Check-ins: <strong>${st.entries.length}</strong></p>
    </section>

    ${worried ? `<div class="nudge">⚠️ Your latest check-in shows high pain or a rough day. Consider contacting your doctor now.
      If it's sudden, severe, or feels life-threatening, seek emergency care instead of emailing.</div>` : ""}

    <section class="report-section">
      <h3>Recent check-ins</h3>
      ${logItems ? `<ul class="log">${logItems}</ul>` : "<p>No check-ins yet. Add your first one on the left 👈</p>"}
    </section>

    <div class="action-row">
      <button type="button" class="action-button is-primary" data-action="email">Draft email to doctor ✉️</button>
      <button type="button" class="action-button" data-action="copy">Copy update</button>
      <button type="button" class="action-button" data-action="print">Print</button>
      <button type="button" class="action-button is-danger" data-action="clear">Clear my data</button>
    </div>

    <div class="report-safety">
      <strong>Privacy &amp; safety</strong><br>
      Entries are stored only in this browser. The email draft opens in your own mail app so you can review it before sending.
      Regular email isn't a secure or urgent channel. For emergencies, call your local emergency number.
      This tracker doesn't diagnose conditions or recommend medicines.
    </div>
  `;
}

trackerView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const s = loadTracker();
  const action = button.dataset.action;

  if (action === "email") {
    if (!s.entries || !Object.keys(s.entries).length) {
      toast("Add a check-in first, then draft your update 📝");
      return;
    }
    if (!EMAIL_RE.test((s.doctorEmail || "").trim())) {
      toast("Tip: add your doctor's email in setup. Opening a blank draft.");
    }
    openEmailDraft(s.doctorEmail, `Recovery update${s.patientName ? " — " + s.patientName : ""}`, buildUpdateText(s));
  } else if (action === "copy") {
    copyText(buildUpdateText(s), button);
  } else if (action === "print") {
    window.print();
  } else if (action === "clear") {
    if (window.confirm("Delete your saved setup and all check-ins from this browser?")) {
      try { localStorage.removeItem(TRACKER_KEY); } catch (error) { /* ignore */ }
      setupForm.reset();
      checkinForm.reset();
      $("#cPainOut").textContent = "0";
      configureCheckinDate(loadTracker());
      renderTracker();
      toast("All tracker data cleared 🧹");
    }
  }
});

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = $("#fEmail").value.trim();
  const start = $("#fStart").value;

  if (!start) {
    toast("Pick your day-1 date 📅");
    return;
  }
  if (email && !EMAIL_RE.test(email)) {
    toast("That doctor's email doesn't look right 🤔");
    return;
  }

  const s = loadTracker();
  s.patientName = $("#fName").value.trim();
  s.doctorName = $("#fDoctor").value.trim();
  s.doctorEmail = email;
  s.startDate = start;
  if (storageSet(TRACKER_KEY, s)) toast("Setup saved ✅");
  configureCheckinDate(s);
  renderTracker();
});

$("#cPain").addEventListener("input", (event) => {
  $("#cPainOut").textContent = event.target.value;
});

checkinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const s = loadTracker();

  if (!s.startDate) {
    toast("Save your setup first (start date) 👆");
    return;
  }

  const dateKey = $("#cDate").value;
  const moodInput = $("input[name='mood']:checked", checkinForm);
  if (!dateKey || !moodInput) {
    toast("Pick a date and how you feel 🙂");
    return;
  }

  const offset = dayDiff(parseKey(dateKey), parseKey(s.startDate));
  if (offset < 0 || offset >= WINDOW_DAYS) {
    toast("That date is outside your 30-day window 📅");
    return;
  }
  if (parseKey(dateKey) > startOfToday()) {
    toast("You can't check in for a future date ⏳");
    return;
  }

  s.entries[dateKey] = {
    mood: Number(moodInput.value),
    pain: Number($("#cPain").value),
    meds: $("#cMeds").value,
    note: $("#cNote").value.trim()
  };

  if (storageSet(TRACKER_KEY, s)) toast("Check-in saved 🎉");
  $("#cNote").value = "";
  moodInput.checked = false;
  renderTracker();
});

/* ---------- init ---------- */
fillSetupForm();
renderTracker();