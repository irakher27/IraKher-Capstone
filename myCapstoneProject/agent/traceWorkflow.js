/**
 * traceWorkflow.js
 * -----------------
 * Runs the same agent loop as runWorkflow.js, but instead of only
 * caring about the final ranked list, it records WHY each candidate
 * survives or gets vetoed for each persona, at each attempt. Writes
 * data/trace.json for renderProcessViewer.js to visualize.
 *
 * This is a read-only diagnostic run — it re-fetches from OMDb and
 * recomputes scores, but doesn't overwrite results.json.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { scoreGroupMovies } = require("../skill/scoreGroupMovies");
const { fetchMoviesByTitles } = require("../adapters/omdbAdapter");
const { createFilesystemClient } = require("./mcpFilesystemClient");

const PROJECT_ROOT = path.join(__dirname, "..");
const PERSONAS_DIR = path.join(PROJECT_ROOT, "personas");
const CANDIDATE_TITLES_PATH = path.join(PROJECT_ROOT, "data", "candidateTitles.json");
const TRACE_OUTPUT_PATH = path.join(PROJECT_ROOT, "data", "trace.json");

const fsClient = createFilesystemClient(PROJECT_ROOT);

async function loadPersonas() {
  const files = await fsClient.listJsonFiles(PERSONAS_DIR);
  const personas = [];
  for (const file of files) {
    const raw = await fsClient.readTextFile(path.join(PERSONAS_DIR, file));
    personas.push(JSON.parse(raw));
  }
  return personas;
}

/**
 * Mirrors the veto rules in skill/scoreGroupMovies.js, but keeps the
 * per-persona reasoning instead of collapsing it to a boolean, so the
 * viewer can explain each exclusion.
 */
function explainVetoes(movie, personas, { skipPlatformCheck }) {
  return personas.map((persona) => {
    const reasons = [];

    const dislikedGenre = movie.genres.find((g) => persona.disliked_genres.includes(g));
    if (dislikedGenre) reasons.push(`dislikes genre "${dislikedGenre}"`);

    if (persona.disliked_titles.includes(movie.title)) {
      reasons.push(`explicitly dislikes "${movie.title}"`);
    }

    if (!skipPlatformCheck) {
      const overlaps = movie.platforms.some((p) => persona.platforms.includes(p));
      if (!overlaps) reasons.push("not available on any platform this persona has");
    }

    return { persona: persona.name, vetoed: reasons.length > 0, reasons };
  });
}

function buildAttempt(candidates, personas, options) {
  const perMovie = candidates.map((movie) => {
    const personaVetoes = explainVetoes(movie, personas, options);
    const survived = !personaVetoes.some((v) => v.vetoed);
    return { title: movie.title, genres: movie.genres, survived, personaVetoes };
  });

  const scored = scoreGroupMovies(candidates, personas, { topN: 5, ...options });

  return {
    skipPlatformCheck: !!options.skipPlatformCheck,
    perMovie,
    survivorsCount: perMovie.filter((m) => m.survived).length,
    scored,
  };
}

async function traceWorkflow() {
  console.log("Perceiving: loading persona profiles (via filesystem MCP server)...");
  const personas = await loadPersonas();

  console.log("Acting: fetching candidate movie details from OMDb...");
  const seedTitles = JSON.parse(fs.readFileSync(CANDIDATE_TITLES_PATH, "utf-8"));
  const candidates = await fetchMoviesByTitles(seedTitles);

  console.log("Observing: scoring candidates with full checks (attempt 1)...");
  const attempt1 = buildAttempt(candidates, personas, { skipPlatformCheck: false });

  console.log("Reasoning about whether a second attempt is needed...");
  const needsRetry = attempt1.scored.length < 5;
  const reasoning = needsRetry
    ? "Fewer than 5 results survived attempt 1. Platform data isn't filled in yet " +
      "(that happens later, via web-search MCP), so retrying without the platform check."
    : "Attempt 1 already produced 5 results — no retry needed.";

  let attempt2 = null;
  if (needsRetry) {
    console.log("Acting again: scoring candidates with the platform check skipped (attempt 2)...");
    attempt2 = buildAttempt(candidates, personas, { skipPlatformCheck: true });
  }

  const finalResults = attempt2 ? attempt2.scored : attempt1.scored;

  const trace = {
    generatedAt: new Date().toISOString(),
    personas,
    seedTitles,
    candidates,
    attempt1,
    reasoning,
    attempt2,
    finalResults,
  };

  fs.writeFileSync(TRACE_OUTPUT_PATH, JSON.stringify(trace, null, 2));
  console.log(`Done. Wrote trace to ${TRACE_OUTPUT_PATH}`);
}

traceWorkflow()
  .catch((err) => {
    console.error("Trace run failed:", err);
  })
  .finally(() => fsClient.close());
