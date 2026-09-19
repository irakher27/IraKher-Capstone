/**
 * omdbAdapter.js
 * ---------------
 * ONE job: call the OMDb API and reshape its response into the
 * exact shape your Skill (scoreGroupMovies) expects:
 *   { title, genres, platforms }
 *
 * This file does NOT score or filter anything. It only fetches
 * and reshapes data. Keeping it separate means your Skill never
 * needs to know or care which movie API you're using.
 *
 * NOTE: OMDb has no streaming-platform data at all, so `platforms`
 * is left as an empty array here. That gap gets filled in later
 * by your web-search MCP step, not by this file.
 *
 * CACHING: OMDb's free tier caps out at 1,000 requests/day, and every
 * run was re-fetching the entire candidate list from scratch — easy
 * to blow through in a single day of testing. Results are cached to
 * omdbCache.json (keyed by lowercased/trimmed title) so a title is
 * only ever fetched from the network once. Delete that file if you
 * want to force a refetch (e.g. OMDb's data changed).
 *
 * DATA_DIR lets this survive redeploys on hosts with an ephemeral
 * filesystem (e.g. Railway): set DATA_DIR to a mounted persistent
 * volume's path in production. Defaults to the repo's data/ folder.
 */

require("dotenv").config(); // loads variables from your .env file

const fs = require("fs");
const path = require("path");

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_BASE_URL = "http://www.omdbapi.com/";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const CACHE_PATH = path.join(DATA_DIR, "omdbCache.json");

function cacheKey(title) {
  return String(title).trim().toLowerCase();
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
 * Fetches a single movie by title from OMDb and reshapes it. Does NOT
 * check the cache — that's fetchMoviesByTitles' job, since it needs to
 * batch reads/writes across the whole title list.
 * @param {string} title - the movie title to search for
 * @returns {Promise<Object|null>} a movie in {title, genres, platforms} shape, or null if not found
 */
async function fetchMovieByTitle(title) {
  const url = `${OMDB_BASE_URL}?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.Response === "False") {
    // Quota exhaustion looks identical to "not found" unless you check
    // the message — treating it as "not found" was silently returning
    // empty recommendations with no indication anything was wrong.
    if (data.Error && /limit/i.test(data.Error)) {
      throw new Error(`OMDb request limit reached while fetching "${title}": ${data.Error}`);
    }
    return null; // genuinely not found — fine to cache as such
  }

  return {
    title: data.Title,
    // OMDb returns genres as a comma-separated string, e.g. "Action, Sci-Fi"
    // your Skill expects an array, so we split and clean it up here
    genres: data.Genre.split(",").map((g) => g.trim()),
    // OMDb has no platform/streaming data — left empty on purpose.
    // This gets filled in later by the web-search MCP step.
    platforms: [],
  };
}

/**
 * Fetches multiple movies by title, using the on-disk cache for any
 * title already looked up before. Skips any titles OMDb couldn't find,
 * instead of crashing — but a real quota error still throws, since
 * that's a different problem you need to actually notice.
 * @param {string[]} titles - list of movie titles to fetch
 * @returns {Promise<Object[]>} array of movies in {title, genres, platforms} shape
 */
async function fetchMoviesByTitles(titles) {
  const cache = loadCache();
  let cacheChanged = false;

  // allSettled, not all: titles fetch concurrently, and if one hits the
  // quota wall we still want to keep + persist whatever the others
  // successfully fetched in the same batch, instead of losing it.
  const settled = await Promise.allSettled(
    titles.map(async (title) => {
      const key = cacheKey(title);
      if (Object.prototype.hasOwnProperty.call(cache, key)) {
        return cache[key]; // cached movie object, or cached null (known not-found)
      }
      const movie = await fetchMovieByTitle(title);
      cache[key] = movie;
      cacheChanged = true;
      return movie;
    })
  );

  if (cacheChanged) saveCache(cache);

  const results = [];
  let firstError = null;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      if (outcome.value !== null) results.push(outcome.value);
    } else if (!firstError) {
      firstError = outcome.reason;
    }
  }

  // Surface a real failure (e.g. quota exhaustion) after saving
  // progress — don't silently return a truncated result set.
  if (firstError) throw firstError;

  return results;
}

module.exports = { fetchMovieByTitle, fetchMoviesByTitles };
