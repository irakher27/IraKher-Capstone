/**
 * renderUserJourney.js
 * ----------------------
 * Writes site.html: a mockup of the actual end-user flow — pick who's
 * watching, click one button, watch it work, get the group's ranked
 * movie picks. This is the "front door" experience, as opposed to
 * process.html (which shows the agent's internal reasoning).
 *
 * Unlike a static mockup, the ranking is recomputed live in the
 * browser: the real scoreGroupMovies skill and the real fetched
 * candidate movies are embedded inline, and results are recalculated
 * from whichever personas are actually checked. Same attempt-then-
 * retry behavior as runWorkflow.js (try with the platform check,
 * fall back to skipping it if fewer than 5 survive).
 */

const fs = require("fs");
const path = require("path");

const PERSONAS_DIR = path.join(__dirname, "..", "personas");
const TRACE_PATH = path.join(__dirname, "..", "data", "trace.json");
const SKILL_PATH = path.join(__dirname, "..", "skill", "scoreGroupMovies.js");
const OUTPUT_PATH = path.join(__dirname, "..", "site.html");

const personas = fs
  .readdirSync(PERSONAS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PERSONAS_DIR, f), "utf-8")));

const trace = JSON.parse(fs.readFileSync(TRACE_PATH, "utf-8"));
const candidates = trace.candidates;

// Embed the real skill as-is (it's dependency-free), just drop the
// CommonJS export line so it can run as a plain inline <script>.
const skillSource = fs
  .readFileSync(SKILL_PATH, "utf-8")
  .replace(/module\.exports\s*=.*$/m, "");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const personaOptions = personas
  .map(
    (p, i) => `
    <label class="persona-option" for="p${i}">
      <input type="checkbox" id="p${i}" data-name="${esc(p.name)}" checked>
      <div class="persona-option-body">
        <div class="persona-option-name">${esc(p.name)}</div>
        <div class="persona-option-likes">Likes ${p.liked_genres.slice(0, 3).map(esc).join(", ")}</div>
      </div>
    </label>`
  )
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Movie Night — Find Our Movie</title>
<style>
  :root {
    --bg: #14141a; --panel: #1f1f28; --border: #2c2c38;
    --text: #f0f0f2; --muted: #9a9aa5;
    --accent: #6c5ce7; --accent2: #a29bfe; --good: #34c77b;
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg); color: var(--text);
    margin: 0; min-height: 100vh;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 48px 20px;
  }
  .screen { width: 100%; max-width: 640px; display: none; }
  .screen.active { display: block; }

  h1 { text-align: center; font-size: 1.9rem; margin: 0 0 6px; }
  .subtitle { text-align: center; color: var(--muted); margin-bottom: 32px; }

  .persona-list { display: grid; gap: 10px; margin-bottom: 28px; }
  .persona-option {
    display: flex; align-items: center; gap: 12px;
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px 16px; cursor: pointer;
  }
  .persona-option input { width: 18px; height: 18px; accent-color: var(--accent); }
  .persona-option-name { font-weight: 600; }
  .persona-option-likes { color: var(--muted); font-size: 0.85rem; }

  .primary-btn {
    display: block; width: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    color: white; border: none; border-radius: 12px;
    padding: 16px; font-size: 1.05rem; font-weight: 600;
    cursor: pointer;
  }
  .primary-btn:disabled { opacity: 0.4; cursor: default; }
  .ghost-btn {
    display: block; width: 100%; margin-top: 14px;
    background: transparent; color: var(--muted);
    border: 1px solid var(--border); border-radius: 12px;
    padding: 12px; font-size: 0.9rem; cursor: pointer;
  }
  .hint { text-align: center; color: var(--muted); font-size: 0.85rem; margin-top: -18px; margin-bottom: 20px; }

  .loading-wrap { text-align: center; padding: 60px 0; }
  .spinner {
    width: 48px; height: 48px; margin: 0 auto 28px;
    border: 4px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-steps { display: grid; gap: 10px; max-width: 380px; margin: 0 auto; text-align: left; }
  .loading-step {
    display: flex; align-items: center; gap: 10px;
    color: var(--muted); font-size: 0.92rem; opacity: 0.4;
    transition: opacity 0.25s;
  }
  .loading-step.active { opacity: 1; color: var(--text); }
  .loading-step.done { opacity: 0.7; color: var(--good); }
  .step-mark { width: 16px; text-align: center; }

  .grid { display: grid; gap: 14px; }
  .card {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 18px 20px; position: relative;
    opacity: 0; animation: fadeUp 0.4s ease forwards;
  }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .rank { position: absolute; top: 14px; right: 18px; color: #5b5b68; font-weight: 700; font-size: 0.9rem; }
  .final-card h2 { margin: 0 0 6px; font-size: 1.2rem; }
  .genres { color: var(--muted); font-size: 0.9rem; margin-bottom: 12px; }
  .score-row { display: flex; align-items: center; gap: 10px; }
  .score-bar { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
  .score-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 4px; }
  .score-label { font-size: 0.85rem; color: #c7c7d1; width: 40px; text-align: right; }

  .selected-note { text-align: center; color: var(--muted); font-size: 0.85rem; margin-bottom: 20px; }
  .empty-note { text-align: center; color: var(--muted); padding: 24px 0; }
</style>
</head>
<body>

  <section class="screen active" id="screen-select">
    <h1>Movie Night</h1>
    <div class="subtitle">Who's watching tonight?</div>
    <div class="persona-list">
      ${personaOptions}
    </div>
    <button class="primary-btn" id="findBtn">Find Our Movie</button>
    <div class="hint" id="hint"></div>
  </section>

  <section class="screen" id="screen-loading">
    <div class="loading-wrap">
      <div class="spinner"></div>
      <div class="loading-steps">
        <div class="loading-step" data-step="0"><span class="step-mark">○</span> Checking everyone's preferences</div>
        <div class="loading-step" data-step="1"><span class="step-mark">○</span> Searching the movie database</div>
        <div class="loading-step" data-step="2"><span class="step-mark">○</span> Filtering out anything someone would veto</div>
        <div class="loading-step" data-step="3"><span class="step-mark">○</span> Ranking the best group matches</div>
      </div>
    </div>
  </section>

  <section class="screen" id="screen-results">
    <h1 id="resultsHeading">Tonight's Picks</h1>
    <div class="selected-note" id="selectedNote"></div>
    <div class="grid" id="resultsGrid"></div>
    <button class="ghost-btn" id="restartBtn">Pick different people</button>
  </section>

<script>
  // ---- embedded data (real, from the last actual pipeline run) ----
  const ALL_PERSONAS = ${JSON.stringify(personas)};
  const CANDIDATES = ${JSON.stringify(candidates)};

  // ---- the real skill, unmodified except for its module.exports line ----
  ${skillSource}
</script>
<script>
  const screens = {
    select: document.getElementById('screen-select'),
    loading: document.getElementById('screen-loading'),
    results: document.getElementById('screen-results'),
  };
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  const findBtn = document.getElementById('findBtn');
  const hint = document.getElementById('hint');

  function getSelectedPersonas() {
    const checkedNames = Array.from(document.querySelectorAll('.persona-option input'))
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.name);
    return ALL_PERSONAS.filter((p) => checkedNames.includes(p.name));
  }

  function updateFindButtonState() {
    const none = getSelectedPersonas().length === 0;
    findBtn.disabled = none;
    hint.textContent = none ? 'Pick at least one person first.' : '';
  }
  document.querySelectorAll('.persona-option input').forEach((cb) =>
    cb.addEventListener('change', updateFindButtonState)
  );
  updateFindButtonState();

  function computeResults(selectedPersonas) {
    // Same fallback the real agent loop uses: try with the platform
    // check enforced, retry without it if too few survive.
    let results = scoreGroupMovies(CANDIDATES, selectedPersonas, { topN: 5 });
    if (results.length < 5) {
      results = scoreGroupMovies(CANDIDATES, selectedPersonas, {
        topN: 5,
        skipPlatformCheck: true,
      });
    }
    return results;
  }

  function renderResults(selectedPersonas) {
    const results = computeResults(selectedPersonas);
    const solo = selectedPersonas.length === 1;

    document.getElementById('resultsHeading').textContent = solo ? 'Recommended For You' : "Tonight's Picks";
    document.getElementById('selectedNote').textContent = solo
      ? 'Personal picks for ' + selectedPersonas[0].name + '.'
      : 'What your group should watch — picked for ' + selectedPersonas.map((p) => p.name).join(', ') + '.';

    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = '';

    if (results.length === 0) {
      grid.innerHTML = solo
        ? '<div class="empty-note">Nothing left that you haven\'t already seen or would veto.</div>'
        : '<div class="empty-note">Nobody in this group agrees on anything tonight.</div>';
      return;
    }

    results.forEach((movie, i) => {
      const card = document.createElement('div');
      card.className = 'card final-card';
      card.style.animationDelay = (i * 90) + 'ms';
      const pct = Math.round(movie.groupScore * 100);
      card.innerHTML =
        '<div class="rank">#' + (i + 1) + '</div>' +
        '<h2></h2>' +
        '<div class="genres"></div>' +
        '<div class="score-row">' +
          '<div class="score-bar"><div class="score-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="score-label">' + pct + '%</span>' +
        '</div>';
      card.querySelector('h2').textContent = movie.title;
      card.querySelector('.genres').textContent = movie.genres.join(' · ');
      grid.appendChild(card);
    });
  }

  findBtn.addEventListener('click', () => {
    const selectedPersonas = getSelectedPersonas();
    if (selectedPersonas.length === 0) return;

    showScreen('loading');

    const stepEls = document.querySelectorAll('.loading-step');
    stepEls.forEach((el) => { el.classList.remove('active', 'done'); el.querySelector('.step-mark').textContent = '○'; });

    let i = 0;
    function tick() {
      if (i > 0) {
        stepEls[i - 1].classList.remove('active');
        stepEls[i - 1].classList.add('done');
        stepEls[i - 1].querySelector('.step-mark').textContent = '✓';
      }
      if (i < stepEls.length) {
        stepEls[i].classList.add('active');
        i++;
        setTimeout(tick, 550);
      } else {
        setTimeout(() => {
          renderResults(selectedPersonas);
          showScreen('results');
        }, 400);
      }
    }
    tick();
  });

  document.getElementById('restartBtn').addEventListener('click', () => showScreen('select'));
</script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`Wrote user-journey mockup to ${OUTPUT_PATH}`);
