/**
 * Skill: getFreshRecommendations
 * --------------------------------
 * ONE job: given the same persona preferences already used to produce
 * the current results, and the list of movie titles already shown
 * this session, return a new top-N from whatever's left in the
 * candidate pool.
 *
 * This backs the "Get new recommendations" button. The original bug
 * there wasn't a broken click handler or a failed network call — it
 * was that re-running the ORIGINAL recommendation skill
 * (scoreGroupMovies) is fully deterministic: same personas, same
 * candidate pool, same scores, same sort, same slice(0, N) every
 * time. Clicking "redo" just recomputed and re-displayed the exact
 * same 5 movies, which looked like the button did nothing. This skill
 * fixes that at the source by excluding the already-shown titles
 * from the candidate pool *before* handing it to scoreGroupMovies, so
 * a repeat call can only ever surface different movies (or correctly
 * report that none are left — see the caller's insufficient-results
 * handling).
 *
 * Reuses scoreGroupMovies for the actual scoring/exclusion rules
 * (disliked genres/titles, platform overlap, liked-title de-dup,
 * genre-match scoring) — this skill only adds one more exclusion on
 * top: titles already shown.
 */

const { scoreGroupMovies } = require("./scoreGroupMovies");

function normalize(value) {
  return String(value).trim().toLowerCase();
}

/**
 * @param {Object[]} candidateMovies - full candidate pool (same shape scoreGroupMovies expects)
 * @param {Object[]} personas - same persona profiles used for the original recommendation
 * @param {string[]} shownTitles - titles already recommended this session, to exclude
 * @param {Object} [options] - forwarded to scoreGroupMovies (e.g. topN, skipPlatformCheck)
 * @returns {Object[]} up to topN movies, none of which are in shownTitles
 */
function getFreshRecommendations(candidateMovies, personas, shownTitles, options = {}) {
  const shown = new Set((shownTitles || []).map(normalize));
  const remainingCandidates = candidateMovies.filter((movie) => !shown.has(normalize(movie.title)));
  return scoreGroupMovies(remainingCandidates, personas, options);
}

module.exports = { getFreshRecommendations };
