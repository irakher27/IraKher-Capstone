/**
 * refreshIndiaAvailability.js
 * -----------------------------
 * Manually-run script that builds/updates data/indiaAvailability.json
 * — the cache agent/runWorkflow.js's fetchCandidates() uses to
 * restrict the recommendation pool to movies actually confirmed
 * streaming in India.
 *
 * For every NON-Bollywood title in data/candidateTitles.json, checks
 * Watchmode (via adapters/watchmodeAdapter.js) for India streaming
 * sources. Bollywood titles (data/bollywoodTitles.json) are trusted
 * as-is and never sent through Watchmode — its India catalog has real
 * gaps there, and would incorrectly exclude legitimate, well-known
 * titles it simply hasn't indexed.
 *
 * Re-run this any time candidateTitles.json changes, or to pick up
 * new Watchmode data:
 *   node agent/refreshIndiaAvailability.js
 *
 * Safe to re-run: titles already in the cache are skipped (their
 * result won't change day to day), so a re-run only fills in gaps —
 * new candidate titles, or ones that errored out on a previous run
 * (e.g. Watchmode's rate limit). To force-recheck a specific title,
 * delete its entry from data/indiaAvailability.json first; to force a
 * full recheck, delete the whole file.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { fetchRawCandidates } = require("./runWorkflow");
const { getStreamingAvailability, cacheKey } = require("../adapters/watchmodeAdapter");

const DATA_DIR = path.join(__dirname, "..", "data");
const INDIA_AVAILABILITY_PATH = path.join(DATA_DIR, "indiaAvailability.json");

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(INDIA_AVAILABILITY_PATH, "utf-8"));
  } catch (err) {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(INDIA_AVAILABILITY_PATH, JSON.stringify(cache, null, 2));
}

async function refreshIndiaAvailability() {
  console.log("Fetching full candidate pool (OMDb + Bollywood tagging)...");
  const candidates = await fetchRawCandidates();
  console.log(`${candidates.length} total candidates (${candidates.filter((c) => c.isBollywood).length} Bollywood, trusted as-is).`);

  const cache = loadCache();
  let checked = 0;
  let skipped = 0;
  let errored = 0;
  const newlyExcluded = [];
  const newlyIncluded = [];

  for (const movie of candidates) {
    const key = cacheKey(movie.title, movie.year);

    if (movie.isBollywood) {
      // Trusted — never gated by Watchmode. Still recorded so the
      // cache has one consistent lookup table for fetchCandidates().
      cache[key] = { available: true, trusted: true, platforms: [] };
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      skipped++;
      continue;
    }

    try {
      const sources = await getStreamingAvailability(movie.title, movie.year);
      const available = sources.length > 0;
      cache[key] = { available, trusted: false, platforms: sources };
      checked++;
      if (available) newlyIncluded.push(`${movie.title} (${movie.year || "?"})`);
      else newlyExcluded.push(`${movie.title} (${movie.year || "?"})`);
      // Saved after every title, not just at the end — this loop can
      // run for several minutes over 200+ titles, and a crash or
      // rate-limit abort partway through shouldn't lose everything
      // already checked.
      saveCache(cache);
    } catch (err) {
      // Leave it unresolved rather than guessing — a later re-run
      // will retry it (see loadCache/hasOwnProperty check above).
      console.error(`  Watchmode lookup failed for "${movie.title}": ${err.message}`);
      errored++;
    }
  }

  saveCache(cache);

  const allEntries = Object.values(cache);
  const totalAvailable = allEntries.filter((e) => e.available).length;
  const totalExcluded = allEntries.filter((e) => !e.available).length;

  console.log("");
  console.log("=== Refresh summary ===");
  console.log(`Newly checked this run: ${checked} (already-cached, skipped: ${skipped}; errored, left for next run: ${errored})`);
  console.log(`Cache now covers ${allEntries.length} titles total: ${totalAvailable} available in India, ${totalExcluded} excluded.`);
  if (newlyExcluded.length) {
    console.log(`Newly excluded this run (${newlyExcluded.length}):`, newlyExcluded.join(", "));
  }
  if (newlyIncluded.length) {
    console.log(`Newly confirmed-available this run (${newlyIncluded.length}):`, newlyIncluded.join(", "));
  }

  return { checked, skipped, errored, totalAvailable, totalExcluded };
}

module.exports = { refreshIndiaAvailability };

if (require.main === module) {
  refreshIndiaAvailability()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Refresh failed:", err);
      process.exit(1);
    });
}
