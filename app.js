"use strict";
/* Luke's ISEE Tests — standalone TRTL app (pilot: Words).
   Data-driven: adding a set = adding an entry to data/sets.json. No build step.
   Results: TEST LOG via FormSubmit AJAX to codafamily@mail.grokbot.com
   (same pattern as the luke-words WORDS LOG flow), with an on-screen
   copyable fallback and a localStorage record if the send fails. */

const LOG_EMAIL = "codafamily@mail.grokbot.com";
const LOG_ENDPOINT = "https://formsubmit.co/ajax/" + LOG_EMAIL;
const STORAGE_KEY = "luke-isee-tests-completed-v1";
const COMING_SOON = ["Verbal Reasoning (VR)", "Quantitative Reasoning (QR)",
  "Reading Comprehension (RC)", "Math Achievement (MA)", "Common Vocab", "AMC 8 (later)"];

let DATA = null, currentSet = null, idx = 0, score = 0, answers = [];

function loadCompletions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch (e) { return {}; }
}
function saveCompletion(set, result) {
  const all = loadCompletions();
  all[set.id] = result;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) { /* log text still shown */ }
}

/* Pure function (also exported for Node verification): builds the TEST LOG text.
   Hard requirement: every missed question, with Luke's answer vs the correct answer. */
function buildTestLog(set, answers, score, when) {
  const missed = answers.filter(a => !a.isCorrect);
  const lines = [];
  lines.push("TEST LOG — Luke ISEE");
  lines.push("Set: " + set.title);
  lines.push("Set ID: " + set.id);
  lines.push("Score: " + score + "/" + answers.length);
  lines.push("Completed: " + when);
  lines.push("");
  if (missed.length === 0) {
    lines.push("Missed questions: none — perfect score.");
  } else {
    lines.push("Missed questions (" + missed.length + "):");
    missed.forEach((a, i) => {
      lines.push((i + 1) + ". " + a.prompt);
      lines.push("   Luke answered: " + a.chosen);
      lines.push("   Correct answer: " + a.correct);
      lines.push("   Feedback: " + a.feedback);
    });
  }
  lines.push("");
  lines.push("All answers:");
  answers.forEach((a, i) => {
    lines.push((i + 1) + ". " + a.prompt + " — Luke: " + a.chosen +
      " | Correct: " + a.correct + " | " + (a.isCorrect ? "RIGHT" : "WRONG"));
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

function startSet(set) {
  currentSet = set; idx = 0; score = 0; answers = [];
  $("set-title").textContent = set.title;
  show("quiz"); renderQuestion();
}

function renderQuestion() {
  const q = currentSet.questions[idx];
  $("progress-text").textContent = "Question " + (idx + 1) + " of " + currentSet.questions.length;
  $("score-text").textContent = "Score: " + score;
  $("progress-fill").style.width = ((idx / currentSet.questions.length) * 100) + "%";
  $("question-prompt").textContent = q.prompt;
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

async function finish() {
  const when = new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
  const logText = buildTestLog(currentSet, answers, score, when);
  saveCompletion(currentSet, { score, total: answers.length, completed: when, log: logText });
  $("final-title").textContent = currentSet.title + " — done!";
  $("final-score").textContent = "Final score: " + score + " / " + answers.length;
  const missed = answers.filter(a => !a.isCorrect);
  $("missed-list").innerHTML = missed.length === 0
    ? "<p>🎉 No misses — perfect!</p>"
    : "<h3>Missed (" + missed.length + ")</h3>" + missed.map(a =>
        "<div class='missed-item'><strong>" + a.prompt + "</strong><br>You answered: " +
        a.chosen + " • Correct: " + a.correct + "<br>" + a.feedback + "</div>").join("");
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
  $("quit-btn").addEventListener("click", renderPicker);
  $("back-btn").addEventListener("click", renderPicker);
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
  module.exports = { buildTestLog };
}
