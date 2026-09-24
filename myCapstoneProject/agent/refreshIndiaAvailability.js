/**
 * refreshIndiaAvailability.js
 * -----------------------------
 * Manually-run script that builds/updates data/indiaAvailability.json
 * — the cache agent/runWorkflow.js's fetchCandidates() uses to
 * restrict the recommendation pool to movies actually confirmed
 * streaming in India, on one of the app's 5 supported platforms
 * (adapters/watchmodeAdapter.js's ALLOWED_PLATFORMS — Netflix,
 * JioHotstar, Prime Video, Apple TV, SonyLIV).
 *
 * For every NON-Bollywood title in data/candidateTitles.json, checks
 * Watchmode (via adapters/watchmodeAdapter.js) for India streaming
 * sources. Bollywood titles (data/bollywoodTitles.json) are trusted
 * as-is and never sent through Watchmode — its India catalog has real
 * gaps there, and would incorrectly exclude legitimate, well-known
 * titles it simply hasn't indexed.
 *
 * Re-run this any time candidateTitles.json changes, to pick up new
 * Watchmode data, or after changing ALLOWED_PLATFORMS:
 *   node agent/refreshIndiaAvailability.js
 *
 * Always recomputes every non-Bollywood title's available/platforms
 * fields from scratch (so criteria changes like a narrower allowed-
 * platform list take effect on every title, not just new ones) — but
 * this is cheap and safe to re-run often, since the expensive part
 * (the actual Watchmode API calls) is itself cached one layer down,
 * in watchmodeCache.json via getStreamingAvailability. A title only
 * ever hits the live API once; re-running this script after that just
 * re-derives available/platforms from the already-cached raw sources.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { fetchRawCandidates } = require("./runWorkflow");
const { getStreamingAvailability, cacheKey, filterToAllowedPlatforms } = require("../adapters/watchmodeAdapter");

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

  const previousCache = loadCache();
  const cache = {};
  let checked = 0;
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

    try {
      const rawSources = await getStreamingAvailability(movie.title, movie.year);
      const allowedSources = filterToAllowedPlatforms(rawSources);
      const available = allowedSources.length > 0;
      const wasAvailable = previousCache[key] && previousCache[key].available;
      cache[key] = { available, trusted: false, platforms: allowedSources };
      checked++;
      if (available && !wasAvailable) newlyIncluded.push(`${movie.title} (${movie.year || "?"})`);
      if (!available && wasAvailable) newlyExcluded.push(`${movie.title} (${movie.year || "?"})`);
      // Saved after every title, not just at the end — this loop can
      // run for several minutes over 200+ titles, and a crash or
      // rate-limit abort partway through shouldn't lose everything
      // already checked.
      saveCache(cache);
    } catch (err) {
      // Fall back to whatever this title's previous entry said rather
      // than guessing — a later re-run will retry it for real.
      if (previousCache[key]) cache[key] = previousCache[key];
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
  console.log(`Checked this run: ${checked} (errored, kept previous result: ${errored})`);
  console.log(`Cache now covers ${allEntries.length} titles total: ${totalAvailable} available on an allowed platform in India, ${totalExcluded} excluded.`);
  if (newlyExcluded.length) {
    console.log(`Newly excluded this run (${newlyExcluded.length}, were available before -- now only on a non-allowed platform or no longer available at all):`, newlyExcluded.join(", "));
  }
  if (newlyIncluded.length) {
    console.log(`Newly confirmed-available this run (${newlyIncluded.length}):`, newlyIncluded.join(", "));
  }

  return { checked, errored, totalAvailable, totalExcluded, newlyExcluded, newlyIncluded };
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
