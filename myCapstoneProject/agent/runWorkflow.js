/**
 * runWorkflow.js
 * ---------------
 * The agent loop: perceive -> act -> observe -> reason -> act again.
 *
 * This is the piece that actually USES your Skill and your adapter
 * together, and makes a decision if the first attempt doesn't return
 * enough results.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { scoreGroupMovies } = require("../skill/scoreGroupMovies");
const { getFreshRecommendations } = require("../skill/getFreshRecommendations");
const { fetchMoviesByTitles } = require("../adapters/omdbAdapter");
const { createFilesystemClient } = require("./mcpFilesystemClient");

const PROJECT_ROOT = path.join(__dirname, "..");
const PERSONAS_DIR = path.join(PROJECT_ROOT, "personas");
const CANDIDATE_TITLES_PATH = path.join(PROJECT_ROOT, "data", "candidateTitles.json");
// Curated list of Bollywood titles — OMDb has no film-industry/language
// tag to match "Bollywood" against, so this file is the source of truth
// instead (see scoreGroupMovies.js's special-case handling of it).
const BOLLYWOOD_TITLES_PATH = path.join(PROJECT_ROOT, "data", "bollywoodTitles.json");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "data", "results.json");

const fsClient = createFilesystemClient(PROJECT_ROOT);

/**
 * PERCEIVE: load all 5 persona files from the personas folder, via the
 * filesystem MCP server instead of Node's fs module.
 */
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
 * ACT (shared): fetch every candidate's OMDb details and tag each one
 * with isBollywood. Both the original recommendation workflow and the
 * "get new recommendations" redo workflow need this exact same pool.
 */
async function fetchCandidates() {
  const seedTitles = JSON.parse(fs.readFileSync(CANDIDATE_TITLES_PATH, "utf-8"));
  const bollywoodTitles = JSON.parse(fs.readFileSync(BOLLYWOOD_TITLES_PATH, "utf-8"));
  const bollywoodSet = new Set(bollywoodTitles.map((t) => t.trim().toLowerCase()));
  return (await fetchMoviesByTitles(seedTitles)).map((movie) => ({
    ...movie,
    isBollywood: bollywoodSet.has(movie.title.trim().toLowerCase()),
  }));
}

/**
 * The full agent loop. Pass an array of personas (same shape as the
 * persona JSON files) to skip the personas/ folder entirely — that's
 * how the live onboarding server (server/onboardingServer.js) feeds
 * it real, just-collected people instead of the static test personas.
 */
async function runWorkflow(personas) {
  // --- PERCEIVE ---
  if (!personas) {
    console.log("Perceiving: loading persona profiles from personas/ folder...");
    personas = await loadPersonas();
  } else {
    console.log(`Perceiving: using ${personas.length} personas passed in directly (skipping personas/ folder).`);
  }
  console.log(`Loaded ${personas.length} personas.`);

  // --- ACT ---
  console.log("Acting: fetching candidate movie details from OMDb...");
  const candidates = await fetchCandidates();
  console.log(`Fetched details for ${candidates.length} candidate movies.`);

  // --- OBSERVE (attempt 1: full checks, including platform overlap) ---
  console.log("Observing: scoring candidates with full checks...");
  let results = scoreGroupMovies(candidates, personas, { topN: 5 });
  console.log(`Attempt 1 produced ${results.length} results.`);

  // --- REASON ---
  if (results.length < 5) {
    console.log(
      "Reasoning: fewer than 5 results survived. Platform data isn't filled in yet " +
      "(that happens later, via web-search MCP), so retrying without the platform check."
    );

    // --- ACT AGAIN, with the loosened rule ---
    results = scoreGroupMovies(candidates, personas, {
      topN: 5,
      skipPlatformCheck: true,
    });
    console.log(`Attempt 2 (platform check skipped) produced ${results.length} results.`);
  }

  // --- final output ---
  await fsClient.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`Done. Wrote ${results.length} results to ${OUTPUT_PATH}`);

  return results;
}

/**
 * "Get new recommendations": same personas, same candidate pool, same
 * scoring/exclusion rules (via getFreshRecommendations, which wraps
 * scoreGroupMovies) — but with shownTitles additionally excluded, so
 * this can only ever surface movies the group hasn't already seen
 * this session. Mirrors runWorkflow's own two-attempt
 * (full-checks -> platform-check-skipped) fallback.
 *
 * Returns fewer than 5 results (possibly zero) when the remaining
 * candidate pool genuinely doesn't have 5 more matches left — the
 * caller (server/onboardingServer.js) is responsible for treating
 * that as "no more matches" rather than silently showing a partial
 * grid.
 */
async function runRedoWorkflow(personas, shownTitles) {
  console.log(`Perceiving: using ${personas.length} personas, excluding ${shownTitles.length} already-shown titles.`);

  console.log("Acting: fetching candidate movie details from OMDb...");
  const candidates = await fetchCandidates();
  console.log(`Fetched details for ${candidates.length} candidate movies.`);

  console.log("Observing: scoring remaining candidates with full checks...");
  let results = getFreshRecommendations(candidates, personas, shownTitles, { topN: 5 });
  console.log(`Attempt 1 produced ${results.length} fresh results.`);

  if (results.length < 5) {
    console.log(
      "Reasoning: fewer than 5 fresh results survived. Platform data isn't filled in yet " +
      "(that happens later, via web-search MCP), so retrying without the platform check."
    );
    results = getFreshRecommendations(candidates, personas, shownTitles, {
      topN: 5,
      skipPlatformCheck: true,
    });
    console.log(`Attempt 2 (platform check skipped) produced ${results.length} fresh results.`);
  }

  return results;
}

module.exports = { runWorkflow, runRedoWorkflow };

// Only auto-run when invoked directly (`node agent/runWorkflow.js`) —
// not when required as a module by the onboarding server.
if (require.main === module) {
  runWorkflow()
    .catch((err) => {
      console.error("Workflow failed:", err);
    })
    .finally(() => fsClient.close());
}