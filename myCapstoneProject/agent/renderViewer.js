/**
 * renderViewer.js
 * ----------------
 * Reads data/results.json and writes a self-contained viewer.html
 * (data embedded inline, so it opens directly in a browser with no
 * server and no fetch/CORS issues).
 */

const fs = require("fs");
const path = require("path");

const RESULTS_PATH = path.join(__dirname, "..", "data", "results.json");
const OUTPUT_PATH = path.join(__dirname, "..", "viewer.html");

const results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const cards = results
  .map((movie, i) => {
    const poster =
      movie.poster && movie.poster.startsWith("http")
        ? `<img class="poster" src="${esc(movie.poster)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'poster-placeholder',textContent:'🎬'}))">`
        : `<div class="poster-placeholder">🎬</div>`;

    const credits = [
      movie.director ? `Director: ${esc(movie.director)}` : null,
      movie.actors && movie.actors.length ? `Starring: ${movie.actors.slice(0, 3).map(esc).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("   ");

    return `
      <div class="card">
        ${poster}
        <div class="card-body">
          <div class="rank">#${i + 1}</div>
          <h2>${esc(movie.title)}${movie.year ? ` <span class="year">(${esc(movie.year)})</span>` : ""}</h2>
          <div class="genres">${movie.genres.join(" · ")}${movie.imdbRating ? `  ·  ⭐ ${esc(movie.imdbRating)}` : ""}</div>
          ${movie.plot ? `<div class="plot">${esc(movie.plot)}</div>` : ""}
          ${credits ? `<div class="credits">${credits}</div>` : ""}
          <div class="score-row">
            <div class="score-bar"><div class="score-fill" style="width:${(
              movie.groupScore * 100
            ).toFixed(0)}%"></div></div>
            <span class="score-label">${(movie.groupScore * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Group Movie Night — Results</title>
<style>
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #14141a;
    color: #f0f0f2;
    margin: 0;
    padding: 40px 20px;
  }
  h1 {
    text-align: center;
    font-size: 1.8rem;
    margin-bottom: 4px;
  }
  .subtitle {
    text-align: center;
    color: #9a9aa5;
    margin-bottom: 32px;
  }
  .grid {
    display: grid;
    gap: 16px;
    max-width: 720px;
    margin: 0 auto;
  }
  .card {
    background: #1f1f28;
    border: 1px solid #2c2c38;
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    gap: 14px;
  }
  .poster, .poster-placeholder {
    width: 84px;
    height: 126px;
    border-radius: 8px;
    flex-shrink: 0;
    background: #2c2c38;
    object-fit: cover;
  }
  .poster-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
  }
  .card-body {
    flex: 1;
    min-width: 0;
    position: relative;
    padding-right: 28px;
  }
  .rank {
    position: absolute;
    top: 0;
    right: 0;
    color: #5b5b68;
    font-weight: 700;
    font-size: 0.9rem;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 1.15rem;
  }
  h2 .year {
    color: #9a9aa5;
    font-weight: 400;
    font-size: 0.9rem;
  }
  .genres {
    color: #9a9aa5;
    font-size: 0.85rem;
    margin-bottom: 8px;
  }
  .plot {
    font-size: 0.85rem;
    color: #c7c7d1;
    line-height: 1.45;
    margin-bottom: 8px;
  }
  .credits {
    font-size: 0.78rem;
    color: #9a9aa5;
    margin-bottom: 10px;
  }
  .score-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .score-bar {
    flex: 1;
    height: 8px;
    background: #2c2c38;
    border-radius: 4px;
    overflow: hidden;
  }
  .score-fill {
    height: 100%;
    background: linear-gradient(90deg, #6c5ce7, #a29bfe);
    border-radius: 4px;
  }
  .score-label {
    font-size: 0.85rem;
    color: #c7c7d1;
    width: 40px;
    text-align: right;
  }
</style>
</head>
<body>
  <h1>Group Movie Night</h1>
  <div class="subtitle">Top ${results.length} picks, ranked by group score</div>
  <div class="grid">
    ${cards}
  </div>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`Wrote viewer to ${OUTPUT_PATH}`);
