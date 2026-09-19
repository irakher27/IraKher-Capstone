/**
 * renderProcessViewer.js
 * ------------------------
 * Reads data/trace.json (written by traceWorkflow.js) and writes a
 * self-contained process.html: a step-by-step walkthrough of the
 * whole agent loop (personas -> fetch -> score attempt 1 -> reasoning
 * -> score attempt 2 -> final ranking), not just the final screen.
 * Data is embedded inline, so it opens directly in a browser.
 */

const fs = require("fs");
const path = require("path");

const TRACE_PATH = path.join(__dirname, "..", "data", "trace.json");
const OUTPUT_PATH = path.join(__dirname, "..", "process.html");

const trace = JSON.parse(fs.readFileSync(TRACE_PATH, "utf-8"));

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function chip(text, kind) {
  return `<span class="chip ${kind}">${esc(text)}</span>`;
}

// ---- Step 1: personas ----
const personaCards = trace.personas
  .map(
    (p) => `
    <div class="card persona-card">
      <h3>${esc(p.name)}</h3>
      <div class="field"><span class="label">Likes genres</span>${p.liked_genres
        .map((g) => chip(g, "like"))
        .join("")}</div>
      <div class="field"><span class="label">Likes titles</span>${
        p.liked_titles.length
          ? p.liked_titles.map((t) => chip(t, "like")).join("")
          : '<span class="muted">none</span>'
      }</div>
      <div class="field"><span class="label">Dislikes genres</span>${
        p.disliked_genres.length
          ? p.disliked_genres.map((g) => chip(g, "dislike")).join("")
          : '<span class="muted">none</span>'
      }</div>
      <div class="field"><span class="label">Platforms</span>${p.platforms
        .map((pl) => chip(pl, "platform"))
        .join("")}</div>
    </div>`
  )
  .join("\n");

// ---- Step 2: candidates fetched ----
const candidateChips = trace.candidates
  .map(
    (c) => `
    <div class="candidate-row">
      <span class="candidate-title">${esc(c.title)}</span>
      <span class="candidate-genres">${c.genres.map((g) => chip(g, "neutral")).join("")}</span>
    </div>`
  )
  .join("\n");
const missingTitles = trace.seedTitles.filter(
  (t) => !trace.candidates.some((c) => c.title === t)
);

// ---- Steps 3 & 5: attempt breakdowns ----
function renderAttempt(attempt, attemptLabel) {
  const rows = attempt.perMovie
    .map((m) => {
      const vetoDetails = m.personaVetoes
        .filter((v) => v.vetoed)
        .map((v) => `<li><strong>${esc(v.persona)}:</strong> ${v.reasons.map(esc).join(", ")}</li>`)
        .join("");

      return `
      <div class="movie-row ${m.survived ? "survived" : "excluded"}">
        <div class="movie-row-head">
          <span class="status-dot"></span>
          <span class="candidate-title">${esc(m.title)}</span>
          <span class="verdict">${m.survived ? "survives" : "excluded"}</span>
        </div>
        ${vetoDetails ? `<ul class="veto-list">${vetoDetails}</ul>` : ""}
      </div>`;
    })
    .join("\n");

  const scoredRows = attempt.scored
    .map(
      (m, i) => `
      <div class="score-row-full">
        <span class="rank-badge">#${i + 1}</span>
        <span class="candidate-title">${esc(m.title)}</span>
        <span class="score-pct">${(m.groupScore * 100).toFixed(0)}%</span>
      </div>`
    )
    .join("\n");

  return `
    <div class="attempt-summary">
      <strong>${attemptLabel}</strong> — platform check ${
        attempt.skipPlatformCheck ? "<em>skipped</em>" : "<em>enforced</em>"
      }: ${attempt.survivorsCount} of ${attempt.perMovie.length} candidates survived exclusion,
      ${attempt.scored.length} made the final ranked list.
    </div>
    <div class="movie-list">${rows}</div>
    ${
      attempt.scored.length
        ? `<div class="scored-block"><div class="scored-title">Ranked output of this attempt</div>${scoredRows}</div>`
        : `<div class="scored-block empty">No results survived to rank.</div>`
    }
  `;
}

const attempt1Html = renderAttempt(trace.attempt1, "Attempt 1");
const attempt2Html = trace.attempt2 ? renderAttempt(trace.attempt2, "Attempt 2") : "";

// ---- Step 6: final results ----
const finalCards = trace.finalResults
  .map(
    (movie, i) => `
      <div class="card final-card">
        <div class="rank">#${i + 1}</div>
        <h2>${esc(movie.title)}</h2>
        <div class="genres">${movie.genres.join(" · ")}</div>
        <div class="score-row">
          <div class="score-bar"><div class="score-fill" style="width:${(
            movie.groupScore * 100
          ).toFixed(0)}%"></div></div>
          <span class="score-label">${(movie.groupScore * 100).toFixed(0)}%</span>
        </div>
      </div>`
  )
  .join("\n");

const steps = [
  { id: "personas", label: "1 · Personas", icon: "👥" },
  { id: "fetch", label: "2 · Fetch candidates", icon: "🎬" },
  { id: "attempt1", label: "3 · Score (attempt 1)", icon: "🧮" },
  { id: "reasoning", label: "4 · Reasoning", icon: "🤔" },
  { id: "attempt2", label: "5 · Score (attempt 2)", icon: "🔁" },
  { id: "final", label: "6 · Final results", icon: "🏆" },
];

const navButtons = steps
  .map(
    (s, i) =>
      `<button class="step-btn" data-step="${s.id}" data-index="${i}">
        <span class="step-icon">${s.icon}</span><span>${s.label}</span>
      </button>`
  )
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Movie Night Agent — Process Walkthrough</title>
<style>
  :root {
    --bg: #14141a;
    --panel: #1f1f28;
    --border: #2c2c38;
    --text: #f0f0f2;
    --muted: #9a9aa5;
    --accent: #6c5ce7;
    --accent2: #a29bfe;
    --good: #34c77b;
    --bad: #e6604a;
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    margin: 0;
    padding: 32px 20px 60px;
  }
  h1 { text-align: center; font-size: 1.8rem; margin-bottom: 4px; }
  .subtitle { text-align: center; color: var(--muted); margin-bottom: 28px; }

  .stepper {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 900px;
    margin: 0 auto 32px;
  }
  .step-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .step-btn.active {
    color: var(--text);
    border-color: var(--accent);
    background: linear-gradient(90deg, rgba(108,92,231,0.25), rgba(162,155,254,0.15));
  }
  .step-icon { font-size: 1rem; }

  .panel {
    max-width: 780px;
    margin: 0 auto;
    display: none;
  }
  .panel.active { display: block; }
  .panel h2 { font-size: 1.3rem; margin-bottom: 4px; }
  .panel .desc { color: var(--muted); margin-bottom: 20px; font-size: 0.95rem; }

  .grid { display: grid; gap: 14px; }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 18px;
    position: relative;
  }
  .persona-card h3 { margin: 0 0 10px; font-size: 1.05rem; }
  .field { margin-bottom: 8px; font-size: 0.88rem; }
  .label { display: block; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .muted { color: var(--muted); font-size: 0.85rem; }

  .chip {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.78rem;
    margin: 0 4px 4px 0;
  }
  .chip.like { background: rgba(52,199,123,0.15); color: var(--good); }
  .chip.dislike { background: rgba(230,96,74,0.15); color: var(--bad); }
  .chip.platform { background: rgba(162,155,254,0.15); color: var(--accent2); }
  .chip.neutral { background: var(--border); color: var(--text); }

  .candidate-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .candidate-title { font-weight: 600; }
  .candidate-genres { display: flex; flex-wrap: wrap; gap: 4px; }

  .attempt-summary {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 16px;
    font-size: 0.9rem;
  }
  .movie-list { display: grid; gap: 8px; margin-bottom: 20px; }
  .movie-row {
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    background: var(--panel);
  }
  .movie-row.survived { border-left-color: var(--good); }
  .movie-row.excluded { border-left-color: var(--bad); opacity: 0.85; }
  .movie-row-head { display: flex; align-items: center; gap: 10px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
  .movie-row.survived .status-dot { background: var(--good); }
  .movie-row.excluded .status-dot { background: var(--bad); }
  .verdict { margin-left: auto; font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .veto-list { margin: 8px 0 0; padding-left: 22px; font-size: 0.82rem; color: var(--muted); }
  .veto-list li { margin-bottom: 3px; }

  .scored-block { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .scored-block.empty { color: var(--muted); font-size: 0.9rem; text-align: center; }
  .scored-title { font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; }
  .score-row-full { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
  .rank-badge { color: var(--accent2); font-weight: 700; width: 28px; }
  .score-pct { margin-left: auto; color: var(--muted); }

  .reasoning-box {
    background: linear-gradient(135deg, rgba(108,92,231,0.15), rgba(162,155,254,0.06));
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 20px;
    font-size: 1rem;
    line-height: 1.5;
  }

  .rank {
    position: absolute; top: 14px; right: 18px;
    color: #5b5b68; font-weight: 700; font-size: 0.9rem;
  }
  .final-card h2 { margin: 0 0 6px; font-size: 1.2rem; }
  .genres { color: var(--muted); font-size: 0.9rem; margin-bottom: 12px; }
  .score-bar { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
  .score-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 4px; }
  .score-row { display: flex; align-items: center; gap: 10px; }
  .score-label { font-size: 0.85rem; color: #c7c7d1; width: 40px; text-align: right; }

  .nav-arrows { display: flex; justify-content: space-between; max-width: 780px; margin: 24px auto 0; }
  .nav-arrows button {
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;
  }
  .nav-arrows button:disabled { opacity: 0.35; cursor: default; }
</style>
</head>
<body>
  <h1>Movie Night Agent — Process Walkthrough</h1>
  <div class="subtitle">Perceive → Act → Observe → Reason → Act again → Output</div>

  <div class="stepper">
    ${navButtons}
  </div>

  <section class="panel" id="panel-personas">
    <h2>Step 1 · Perceive: load personas</h2>
    <div class="desc">${trace.personas.length} persona profiles loaded via the filesystem MCP server.</div>
    <div class="grid">${personaCards}</div>
  </section>

  <section class="panel" id="panel-fetch">
    <h2>Step 2 · Act: fetch candidate movies</h2>
    <div class="desc">${trace.candidates.length} of ${trace.seedTitles.length} seed titles found on OMDb${
      missingTitles.length ? ` (not found: ${missingTitles.map(esc).join(", ")})` : ""
    }. Platforms come back empty — OMDb has no streaming data; that's filled in later.</div>
    <div>${candidateChips}</div>
  </section>

  <section class="panel" id="panel-attempt1">
    <h2>Step 3 · Observe: score with full checks</h2>
    <div class="desc">Every persona's disliked genres/titles AND platform overlap are enforced. Hover the reasoning to see why each candidate was excluded.</div>
    ${attempt1Html}
  </section>

  <section class="panel" id="panel-reasoning">
    <h2>Step 4 · Reason</h2>
    <div class="reasoning-box">${esc(trace.reasoning)}</div>
  </section>

  <section class="panel" id="panel-attempt2">
    <h2>Step 5 · Act again: score with platform check skipped</h2>
    <div class="desc">Same exclusion rules, minus the platform-overlap veto.</div>
    ${attempt2Html || '<div class="muted">Attempt 1 already produced 5 results, so this step did not run.</div>'}
  </section>

  <section class="panel" id="panel-final">
    <h2>Step 6 · Output: final ranked results</h2>
    <div class="desc">Top ${trace.finalResults.length} picks written to results.json.</div>
    <div class="grid">${finalCards}</div>
  </section>

  <div class="nav-arrows">
    <button id="prevBtn">← Back</button>
    <button id="nextBtn">Next →</button>
  </div>

<script>
  const stepIds = ${JSON.stringify(steps.map((s) => s.id))};
  let current = 0;

  function show(index) {
    current = Math.max(0, Math.min(stepIds.length - 1, index));
    stepIds.forEach((id, i) => {
      document.getElementById('panel-' + id).classList.toggle('active', i === current);
    });
    document.querySelectorAll('.step-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.index) === current);
    });
    document.getElementById('prevBtn').disabled = current === 0;
    document.getElementById('nextBtn').disabled = current === stepIds.length - 1;
  }

  document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => show(Number(btn.dataset.index)));
  });
  document.getElementById('prevBtn').addEventListener('click', () => show(current - 1));
  document.getElementById('nextBtn').addEventListener('click', () => show(current + 1));

  show(0);
</script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`Wrote process viewer to ${OUTPUT_PATH}`);
