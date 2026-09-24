/**
 * watchmodeAdapter.js
 * ---------------------
 * ONE job: given a movie title (and optionally its release year, to
 * disambiguate remakes/reboots), look up which streaming platforms
 * it's available on in India via the Watchmode API, and return the
 * platform name(s) plus a direct URL for each.
 *
 * Two Watchmode calls per title, chained:
 *   1. GET /v1/search/  — find the title's Watchmode id (search by
 *      name; if a year is given, prefer the movie result matching it,
 *      since a title search can return unrelated films that happen to
 *      share a name).
 *   2. GET /v1/title/{id}/sources/?regions=IN — the actual list of
 *      where it's streamable in India.
 *
 * Results are cached to watchmodeCache.json (same pattern as
 * omdbAdapter.js's omdbCache.json) so a title is only ever looked up
 * once — Watchmode's free tier has a fairly low monthly request cap,
 * and every title needs 2 calls.
 *
 * DATA_DIR lets this survive redeploys on hosts with an ephemeral
 * filesystem (e.g. Railway): set DATA_DIR to a mounted persistent
 * volume's path in production. Defaults to the repo's data/ folder.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const WATCHMODE_API_KEY = process.env.WATCHMODE_API_KEY;
const WATCHMODE_BASE_URL = "https://api.watchmode.com/v1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const CACHE_PATH = path.join(DATA_DIR, "watchmodeCache.json");

// Only subscription-tier sources count as "Watch Now" — rent/buy links
// aren't what a group casually picking a movie for tonight wants.
const RELEVANT_SOURCE_TYPES = new Set(["sub", "free"]);

function cacheKey(title, year) {
  return `${String(title).trim().toLowerCase()}::${year || ""}`;
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  } catch (err) {
    return {}; // no cache file yet, or it's corrupt — start fresh
  }
}

function saveCache(cache) {
  fs.mkdirSync(DATA_DIR, { recursive: true }); // no-op if it already exists
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

/**
 * Finds the Watchmode title id for a movie, preferring a "movie" type
 * result whose year matches (when a year is given) over just the
 * first hit — search-by-name alone can surface unrelated titles that
 * happen to share a name (remakes, shorts, fan projects, etc.).
 */
async function findWatchmodeId(title, year) {
  const url = `${WATCHMODE_BASE_URL}/search/?apiKey=${WATCHMODE_API_KEY}&search_field=name&search_value=${encodeURIComponent(title)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status_code && data.status_code >= 400) {
    throw new Error(`Watchmode search failed for "${title}": ${data.status_message || response.status}`);
  }

  const movieResults = (data.title_results || []).filter((r) => r.type === "movie");
  if (movieResults.length === 0) return null;

  if (year) {
    const yearMatch = movieResults.find((r) => String(r.year) === String(year));
    if (yearMatch) return yearMatch.id;
  }
  return movieResults[0].id;
}

/**
 * Fetches India streaming sources for a Watchmode title id, reshaped
 * into { platform, url } and de-duplicated by platform name (keeping
 * the subscription entry over a rent/buy one, if both exist).
 */
async function fetchIndiaSources(watchmodeId) {
  const url = `${WATCHMODE_BASE_URL}/title/${watchmodeId}/sources/?apiKey=${WATCHMODE_API_KEY}&regions=IN`;
  const response = await fetch(url);
  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(`Watchmode sources lookup failed for id ${watchmodeId}: ${data.status_message || response.status}`);
  }

  const byPlatform = new Map();
  for (const source of data) {
    if (source.region !== "IN") continue;
    if (!RELEVANT_SOURCE_TYPES.has(source.type)) continue;
    if (!source.web_url || !source.web_url.startsWith("http")) continue;
    if (!byPlatform.has(source.name)) {
      byPlatform.set(source.name, { platform: source.name, url: source.web_url });
    }
  }
  return [...byPlatform.values()];
}

/**
 * @param {string} title
 * @param {string|number} [year] - release year, to disambiguate same-named titles
 * @returns {Promise<{platform: string, url: string}[]>} empty array if not currently streamable in India (or no Watchmode match at all)
 */
async function getStreamingAvailability(title, year) {
  const key = cacheKey(title, year);
  const cache = loadCache();
  if (Object.prototype.hasOwnProperty.call(cache, key)) {
    return cache[key];
  }

  const watchmodeId = await findWatchmodeId(title, year);
  const sources = watchmodeId ? await fetchIndiaSources(watchmodeId) : [];

  cache[key] = sources;
  saveCache(cache);
  return sources;
}

// Watchmode's India catalog has real gaps, especially for Bollywood/
// Indian-language titles (see data/bollywoodTitles.json) — it simply
// doesn't have those titles indexed at all, not that they're
// unavailable. Rather than tell a user a movie "isn't available"
// when the truth is just "Watchmode doesn't know," fall back to a
// direct search link on the major platforms so they can check
// themselves. Callers should only use this when getStreamingAvailability
// returns an empty array.
const SEARCH_FALLBACK_PLATFORMS = [
  { platform: "Netflix", buildUrl: (q) => `https://www.netflix.com/search?q=${q}` },
  { platform: "Prime Video", buildUrl: (q) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}` },
  { platform: "JioHotstar", buildUrl: (q) => `https://www.hotstar.com/in/search?q=${q}` },
];

/**
 * @param {string} title
 * @returns {{platform: string, url: string, isSearchFallback: true}[]}
 */
function getSearchFallbackLinks(title) {
  const q = encodeURIComponent(title);
  return SEARCH_FALLBACK_PLATFORMS.map(({ platform, buildUrl }) => ({
    platform,
    url: buildUrl(q),
    isSearchFallback: true,
  }));
}

// Watchmode's platform names don't always match this app's own
// platform picker (server/onboardingServer.js's PLATFORMS list) —
// e.g. Watchmode says "Hotstar", the app says "Disney+ Hotstar";
// Watchmode says "AppleTV", the app says "Apple TV+". Cross-
// referencing "is this movie on a platform the user has" requires
// both sides to agree on names first.
const PLATFORM_NAME_ALIASES = {
  hotstar: "Disney+ Hotstar",
  "jiohotstar": "Disney+ Hotstar",
  "disney+ hotstar": "Disney+ Hotstar",
  appletv: "Apple TV+",
  "apple tv": "Apple TV+",
  "apple tv+": "Apple TV+",
  amazon: "Prime Video",
  "prime video": "Prime Video",
  netflix: "Netflix",
  hulu: "Hulu",
  max: "HBO Max",
  "hbo max": "HBO Max",
};

/**
 * @param {string} platformName - a platform name as Watchmode (or our
 *   own search-fallback list) spells it
 * @returns {string} the app's own canonical spelling, or the input
 *   unchanged if it's not one of the app's selectable platforms
 */
function normalizePlatformName(platformName) {
  const key = String(platformName).trim().toLowerCase();
  return PLATFORM_NAME_ALIASES[key] || platformName;
}

module.exports = { getStreamingAvailability, getSearchFallbackLinks, normalizePlatformName, cacheKey };
