/**
 * Skill: scoreGroupMovies
 * ------------------------
 * ONE repeatable task: given a list of candidate movies and persona
 * preference profiles, remove anything anyone explicitly dislikes or
 * has already seen, then score and rank what's left.
 *
 * This function does NOT call any external API. It works on plain
 * JavaScript objects, so it stays reusable no matter which movie-data
 * API (TMDb, OMDb, etc.) you end up wiring in later — that code just
 * needs to produce movies in the shape described below before handing
 * them to this function.
 *
 * Expected movie shape (from whichever API you choose):
 * {
 *   title: "Inception",
 *   genres: ["Thriller", "Sci-Fi"],
 *   platforms: ["Netflix", "Prime Video"]   // where it's streamable
 * }
 *
 * Expected persona shape (matches the persona JSON files already made):
 * {
 *   name: "Persona 1",
 *   liked_genres: ["Thriller", "Sci-Fi", "Action"],
 *   liked_titles: ["Inception", "Mirzapur"],
 *   disliked_genres: ["Horror"],
 *   disliked_titles: [],
 *   platforms: ["Netflix", "Prime Video"]
 * }
 *
 * Recognized genre vocabulary: Musical, Autobiography, Horror, Romance,
 * Comedy, Thriller, Sci-Fi, Action, Adventure, Drama, Fantasy — plus
 * whatever else personas/movie data already use. Most of these are
 * exact matches against the genre tags OMDb returns. "Autobiography"
 * isn't a real OMDb tag, so GENRE_ALIASES below maps it onto the OMDb
 * genre ("Biography") that satisfies it.
 *
 * All genre/title comparisons are case-insensitive and whitespace-
 * trimmed (see normalize()) — "sci-fi", " Sci-Fi ", and "SCI-FI" all
 * match the same thing.
 */

const GENRE_ALIASES = {
  autobiography: { allOf: ["Biography"] },
};

function normalize(value) {
  return String(value).trim().toLowerCase();
}

function sameText(a, b) {
  return normalize(a) === normalize(b);
}

function listIncludes(list, value) {
  return list.some((item) => sameText(item, value));
}

/**
 * Does `movieGenres` satisfy a persona's genre preference (liked or
 * disliked)? Direct match first (case/whitespace-insensitive), then
 * falls back to the alias table for synthetic categories like
 * "Autobiography".
 */
function genreMatchesMovie(genrePreference, movieGenres) {
  if (listIncludes(movieGenres, genrePreference)) return true;
  const alias = GENRE_ALIASES[normalize(genrePreference)];
  return !!alias && alias.allOf.every((g) => listIncludes(movieGenres, g));
}

function scoreGroupMovies(candidateMovies, personas, options = {}) {
  const topN = options.topN || 5;

  // Step 0: de-duplicate candidates by title (case/whitespace-
  // insensitive) so the same movie can never appear twice in one
  // result set, however it ended up duplicated upstream.
  const seenTitles = new Set();
  const uniqueCandidates = candidateMovies.filter((movie) => {
    const key = normalize(movie.title);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  // Step 1: hard exclusion.
  // Any movie that overlaps with ANY persona's disliked genres/titles,
  // that ANY persona has already liked (they've seen it — don't
  // suggest it again), or isn't available on ANY persona's platforms,
  // gets dropped entirely.
  const survivors = uniqueCandidates.filter((movie) => {
    for (const persona of personas) {
      const hasDislikedGenre = persona.disliked_genres.some((g) =>
        genreMatchesMovie(g, movie.genres)
      );
      const isDislikedTitle = listIncludes(persona.disliked_titles, movie.title);
      const alreadyLiked = listIncludes(persona.liked_titles, movie.title);

      // options.skipPlatformCheck lets the agent loop temporarily ignore
      // platform matching — useful early in the pipeline, before the
      // web-search MCP step has filled in real platform data.
      const noPlatformOverlap =
        !options.skipPlatformCheck &&
        !movie.platforms.some((p) => persona.platforms.includes(p));

      if (hasDislikedGenre || isDislikedTitle || alreadyLiked || noPlatformOverlap) {
        return false; // excluded — one veto is enough
      }
    }
    return true;
  });

  // Step 2: soft scoring on whatever survived exclusion.
  // Each persona scores a movie based on genre overlap and liked-title match,
  // then we average across the group.
  function scoreForPersona(movie, persona) {
    const genreMatches = persona.liked_genres.filter((g) =>
      genreMatchesMovie(g, movie.genres)
    ).length;
    const genreScore = genreMatches / Math.max(movie.genres.length, 1);

    // In practice this is always 0 now: a movie in ANYONE's liked_titles
    // is excluded in Step 1 before it ever reaches scoring. Left in place
    // (harmless) in case liked_titles ever includes movies outside the
    // candidate pool.
    const titleBonus = listIncludes(persona.liked_titles, movie.title) ? 1 : 0;

    // weighted: genre match matters most, exact liked-title is a bonus
    return genreScore * 0.8 + titleBonus * 0.2;
  }

  const scored = survivors.map((movie) => {
    const personaScores = personas.map((p) => scoreForPersona(movie, p));
    const groupScore =
      personaScores.reduce((sum, s) => sum + s, 0) / personas.length;

    return { ...movie, groupScore };
  });

  // Step 3: rank and return the top N.
  scored.sort((a, b) => b.groupScore - a.groupScore);

  return scored.slice(0, topN);
}

module.exports = { scoreGroupMovies };
