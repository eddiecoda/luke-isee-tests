"use strict";
/* Luke's ISEE Tests — standalone TRTL app (pilot: Words).
   Data-driven: adding a set = adding an entry to data/sets.json. No build step.
   Results: TEST LOG via FormSubmit AJAX to codafamily@mail.grokbot.com
   (same pattern as the luke-words WORDS LOG flow), with an on-screen
   copyable fallback and a localStorage record if the send fails. */

const LOG_EMAIL = "codafamily@mail.grokbot.com";
const LOG_ENDPOINT = "https://formsubmit.co/ajax/" + LOG_EMAIL;
const STORAGE_KEY = "luke-isee-tests-completed-v1";
const TIMER_KEY = "luke-isee-timer-v1";
const COMING_SOON = ["AMC 8 (later)"];
/* Hardcoded time limits, in minutes. A set not in this table has no timer. */
const SET_MINUTES = {
  "isee-words-test-5": 14,
  "isee-vr-set-8": 15,
  "isee-qr-set-6": 15,
  "isee-rc-set-6": 15,
  "isee-ma-set-7": 15,
  "isee-common-vocab-1": 15,
  "isee-common-vocab-2": 15,
  "isee-common-vocab-3": 15,
  "isee-qr-set-7": 15,
  "isee-ma-set-8": 15
};

let DATA = null, currentSet = null, idx = 0, score = 0, answers = [];
let timerInterval = null, finishing = false;

function loadCompletions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch (e) { return {}; }
}
function saveCompletion(set, result) {
  const all = loadCompletions();
  all[set.id] = result;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) { /* log text still shown */ }
}

function loadTimers() {
  try { return JSON.parse(localStorage.getItem(TIMER_KEY) || "{}"); }
  catch (e) { return {}; }
}
function saveTimers(all) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(all)); } catch (e) { /* display still works */ }
}
function getOrStartTimer(setId) {
  const all = loadTimers();
  if (all[setId] == null) {
    all[setId] = Date.now();
    saveTimers(all);
  }
  return all[setId];
}
function clearTimer(setId) {
  const all = loadTimers();
  if (all[setId] == null) return;
  delete all[setId];
  saveTimers(all);
}
function remainingMs(setId) {
  const minutes = SET_MINUTES[setId];
  if (minutes == null) return null;
  const start = loadTimers()[setId];
  if (start == null) return minutes * 60 * 1000;
  return minutes * 60 * 1000 - (Date.now() - start);
}
function formatTimeLeft(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return "Time left " + m + ":" + String(s).padStart(2, "0");
}
function stopTimerInterval() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

/* Strip embedded markup (e.g. inline SVG figures) so the emailed TEST LOG stays readable plain text. */
function plainText(s) { return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }

function isUnanswered(a) {
  return !!(a && (a.unanswered || a.chosen === "(unanswered)"));
}

/* Pure function (also exported for Node verification): builds the TEST LOG text.
   Hard requirement: every missed question, with Luke's answer vs the correct answer.
   Unanswered items (time ran out) are listed separately and tagged UNANSWERED, not WRONG. */
function buildTestLog(set, answers, score, when, opts) {
  const timeRanOut = !!(opts && opts.timeRanOut);
  const missed = answers.filter(a => !a.isCorrect && !isUnanswered(a));
  const unanswered = answers.filter(isUnanswered);
  const total = (timeRanOut && set && set.questions) ? set.questions.length : answers.length;
  const lines = [];
  lines.push("TEST LOG — Luke ISEE");
  lines.push("Set: " + set.title);
  lines.push("Set ID: " + set.id);
  lines.push("Score: " + score + "/" + total);
  lines.push("Completed: " + when);
  if (timeRanOut) lines.push("Time ran out — " + unanswered.length + " unanswered");
  lines.push("");
  if (missed.length === 0) {
    lines.push(unanswered.length === 0
      ? "Missed questions: none — perfect score."
      : "Missed questions: none.");
  } else {
    lines.push("Missed questions (" + missed.length + "):");
    missed.forEach((a, i) => {
      lines.push((i + 1) + ". " + plainText(a.prompt));
      lines.push("   Luke answered: " + a.chosen);
      lines.push("   Correct answer: " + a.correct);
      lines.push("   Feedback: " + a.feedback);
    });
  }
  if (unanswered.length > 0) {
    lines.push("");
    lines.push("Unanswered questions (" + unanswered.length + "):");
    unanswered.forEach((a, i) => {
      lines.push((i + 1) + ". " + plainText(a.prompt));
      lines.push("   Correct answer: " + a.correct);
    });
  }
  lines.push("");
  lines.push("All answers:");
  answers.forEach((a, i) => {
    const tag = a.isCorrect ? "RIGHT" : (isUnanswered(a) ? "UNANSWERED" : "WRONG");
    lines.push((i + 1) + ". " + plainText(a.prompt) + " — Luke: " + a.chosen +
      " | Correct: " + a.correct + " | " + tag);
  });
  return lines.join("\n");
}

async function sendTestLog(set, logText, score, total) {
  const res = await fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      _subject: "TEST LOG — Luke ISEE — " + set.title + " — " + score + "/" + total,
      _template: "box",
      set: set.title, set_id: set.id,
      score: score + "/" + total,
      message: logText
    })
  });
  if (!res.ok) throw new Error("FormSubmit HTTP " + res.status);
  return res;
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);

function show(sectionId) {
  ["picker", "quiz", "results"].forEach(s => { $(s).hidden = s !== sectionId; });
}

function renderPicker() {
  const done = loadCompletions();
  const el = $("picker");
  el.innerHTML = "";
  const sections = [...new Set(DATA.sets.map(s => s.section))];
  sections.forEach(section => {
    const h = document.createElement("div");
    h.className = "section-label"; h.textContent = section;
    el.appendChild(h);
    DATA.sets.filter(s => s.section === section).forEach(set => {
      const b = document.createElement("button");
      b.className = "set-card"; b.type = "button";
      const left = document.createElement("span");
      left.textContent = set.title + " (" + set.questions.length + " questions)";
      b.appendChild(left);
      if (done[set.id]) {
        const tag = document.createElement("span");
        tag.className = "done";
        tag.textContent = "Done ✓ " + done[set.id].score + "/" + done[set.id].total;
        b.appendChild(tag);
        b.disabled = true; // TRTL no-repeat: a completed set is done
      }
      b.addEventListener("click", () => startSet(set));
      el.appendChild(b);
    });
  });
  const h = document.createElement("div");
  h.className = "section-label"; h.textContent = "Coming soon";
  el.appendChild(h);
  COMING_SOON.forEach(name => {
    const b = document.createElement("button");
    b.className = "set-card"; b.type = "button"; b.disabled = true;
    b.innerHTML = "";
    const l = document.createElement("span"); l.textContent = name;
    const r = document.createElement("span"); r.className = "soon"; r.textContent = "coming soon";
    b.appendChild(l); b.appendChild(r); el.appendChild(b);
  });
  show("picker");
}

function leaveToPicker() {
  stopTimerInterval();
  currentSet = null;
  finishing = false;
  renderPicker();
}

function updateTimeLeft() {
  if (!currentSet) return;
  const left = remainingMs(currentSet.id);
  const el = $("time-left");
  if (left == null) {
    if (el) { el.hidden = true; el.textContent = ""; }
    return;
  }
  if (el) { el.hidden = false; el.textContent = formatTimeLeft(left); }
  if (left <= 0) finish({ timeRanOut: true });
}

function startSet(set) {
  stopTimerInterval();
  currentSet = set; idx = 0; score = 0; answers = [];
  finishing = false;
  $("set-title").textContent = set.title;
  if (SET_MINUTES[set.id] != null) {
    getOrStartTimer(set.id);
    const left = remainingMs(set.id);
    if (left <= 0) {
      // Time already expired (e.g. after Quit); auto-submit with every question unanswered.
      finish({ timeRanOut: true });
      return;
    }
    const el = $("time-left");
    if (el) { el.hidden = false; el.textContent = formatTimeLeft(left); }
    show("quiz"); renderQuestion();
    timerInterval = setInterval(updateTimeLeft, 250);
  } else {
    const el = $("time-left");
    if (el) { el.hidden = true; el.textContent = ""; }
    show("quiz"); renderQuestion();
  }
}

function renderQuestion() {
  const q = currentSet.questions[idx];
  $("progress-text").textContent = "Question " + (idx + 1) + " of " + currentSet.questions.length;
  $("score-text").textContent = "Score: " + score;
  $("progress-fill").style.width = ((idx / currentSet.questions.length) * 100) + "%";
  const pg = $("passage");
  if (q.passage) { pg.textContent = q.passage; pg.hidden = false; }
  else { pg.textContent = ""; pg.hidden = true; }
  $("question-prompt").innerHTML = q.prompt;
  $("feedback").hidden = true; $("next-btn").hidden = true;
  const box = $("options"); box.innerHTML = "";
  q.options.forEach(opt => {
    const b = document.createElement("button");
    b.className = "option"; b.type = "button"; b.textContent = opt;
    b.addEventListener("click", () => answer(b, q, opt));
    box.appendChild(b);
  });
}

function answer(btn, q, chosen) {
  const isCorrect = chosen === q.correct;
  if (isCorrect) score++;
  answers.push({ prompt: q.prompt, chosen, correct: q.correct, feedback: q.feedback, isCorrect });
  document.querySelectorAll(".option").forEach(b => {
    b.disabled = true;
    if (b.textContent === q.correct) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  const fb = $("feedback");
  fb.hidden = false;
  fb.className = isCorrect ? "right" : "wrong";
  fb.textContent = (isCorrect ? "✓ Correct! " : "✗ Not quite — the answer is “" + q.correct + "”. ") + q.feedback;
  $("score-text").textContent = "Score: " + score;
  $("next-btn").textContent = idx + 1 === currentSet.questions.length ? "See results →" : "Next →";
  $("next-btn").hidden = false;
}

async function finish(opts) {
  if (finishing) return;
  finishing = true;
  stopTimerInterval();
  const timeRanOut = !!(opts && opts.timeRanOut);
  if (timeRanOut) {
    for (let i = answers.length; i < currentSet.questions.length; i++) {
      const q = currentSet.questions[i];
      answers.push({
        prompt: q.prompt, chosen: "(unanswered)", correct: q.correct,
        feedback: q.feedback, isCorrect: false, unanswered: true
      });
    }
  }
  const total = timeRanOut ? currentSet.questions.length : answers.length;
  const unanswered = answers.filter(isUnanswered);
  if (currentSet) clearTimer(currentSet.id);
  const when = new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
  const logText = buildTestLog(currentSet, answers, score, when, timeRanOut ? { timeRanOut: true } : undefined);
  saveCompletion(currentSet, { score, total, completed: when, log: logText });
  $("final-title").textContent = currentSet.title + " — done!";
  $("final-score").textContent = "Final score: " + score + " / " + total;
  const ranOutEl = $("time-ran-out");
  if (ranOutEl) {
    if (timeRanOut) {
      ranOutEl.hidden = false;
      ranOutEl.textContent = "Time ran out — " + unanswered.length + " unanswered";
    } else {
      ranOutEl.hidden = true;
      ranOutEl.textContent = "";
    }
  }
  const missed = answers.filter(a => !a.isCorrect && !isUnanswered(a));
  let missedHtml;
  if (missed.length === 0 && unanswered.length === 0) {
    missedHtml = "<p>🎉 No misses — perfect!</p>";
  } else {
    missedHtml = "";
    if (missed.length === 0) missedHtml += "<p>No missed answers.</p>";
    else missedHtml += "<h3>Missed (" + missed.length + ")</h3>" + missed.map(a =>
        "<div class='missed-item'><strong>" + a.prompt + "</strong><br>You answered: " +
        a.chosen + " • Correct: " + a.correct + "<br>" + a.feedback + "</div>").join("");
    if (unanswered.length > 0) {
      missedHtml += "<h3>Unanswered (" + unanswered.length + ")</h3>" + unanswered.map(a =>
        "<div class='missed-item'><strong>" + a.prompt + "</strong><br>Correct: " +
        a.correct + "</div>").join("");
    }
  }
  $("missed-list").innerHTML = missedHtml;
  $("log-text").value = logText;
  show("results");
  await trySendLog(logText);
}

async function trySendLog(logText) {
  $("log-status").textContent = "Sending your results…";
  try {
    await sendTestLog(currentSet, logText, score, answers.length);
    $("log-status").textContent = "✓ TEST LOG sent to Muse.";
  } catch (e) {
    $("log-status").textContent = "⚠️ Sending didn't go through (" + e.message + "). " +
      "Your log is saved on this phone below — tap “Copy TEST LOG”.";
  }
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", async () => {
  $("quit-btn").addEventListener("click", leaveToPicker);
  $("back-btn").addEventListener("click", leaveToPicker);
  $("next-btn").addEventListener("click", () => {
    idx++;
    if (idx < currentSet.questions.length) renderQuestion(); else finish();
  });
  $("copy-log-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("log-text").value); $("copy-log-btn").textContent = "Copied ✓"; }
    catch (e) { $("log-text").select(); document.execCommand("copy"); }
  });
  $("retry-log-btn").addEventListener("click", () => trySendLog($("log-text").value));
  try {
    const res = await fetch("data/sets.json");
    DATA = await res.json();
    renderPicker();
  } catch (e) {
    $("picker").textContent = "Could not load the tests (" + e.message + "). Check your connection and reload.";
  }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildTestLog, SET_MINUTES, formatTimeLeft, isUnanswered };
}
