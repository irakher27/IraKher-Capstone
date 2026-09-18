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

const cards = results
  .map(
    (movie, i) => `
      <div class="card">
        <div class="rank">#${i + 1}</div>
        <h2>${movie.title}</h2>
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
    padding: 18px 20px;
    position: relative;
  }
  .rank {
    position: absolute;
    top: 14px;
    right: 18px;
    color: #5b5b68;
    font-weight: 700;
    font-size: 0.9rem;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 1.2rem;
  }
  .genres {
    color: #9a9aa5;
    font-size: 0.9rem;
    margin-bottom: 12px;
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
