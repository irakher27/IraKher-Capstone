/**
 * Skill: scoreGroupMovies
 * ------------------------
 * ONE repeatable task: given a list of candidate movies and 5 persona
 * preference profiles, remove anything anyone explicitly dislikes,
 * then score and rank what's left.
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
 */

function scoreGroupMovies(candidateMovies, personas, options = {}) {
  const topN = options.topN || 5;

  // Step 1: hard exclusion.
  // Any movie that overlaps with ANY persona's disliked genres/titles,
  // or isn't available on ANY persona's platforms, gets dropped entirely.
  const survivors = candidateMovies.filter((movie) => {
    for (const persona of personas) {
      const hasDislikedGenre = movie.genres.some((g) =>
        persona.disliked_genres.includes(g)
      );
      const isDislikedTitle = persona.disliked_titles.includes(movie.title);

      // options.skipPlatformCheck lets the agent loop temporarily ignore
      // platform matching — useful early in the pipeline, before the
      // web-search MCP step has filled in real platform data.
      const noPlatformOverlap =
        !options.skipPlatformCheck &&
        !movie.platforms.some((p) => persona.platforms.includes(p));

      if (hasDislikedGenre || isDislikedTitle || noPlatformOverlap) {
        return false; // excluded — one veto is enough
      }
    }
    return true;
  });

  // Step 2: soft scoring on whatever survived exclusion.
  // Each persona scores a movie based on genre overlap and liked-title match,
  // then we average across the group.
  function scoreForPersona(movie, persona) {
    const genreMatches = movie.genres.filter((g) =>
      persona.liked_genres.includes(g)
    ).length;
    const genreScore = genreMatches / Math.max(movie.genres.length, 1);

    const titleBonus = persona.liked_titles.includes(movie.title) ? 1 : 0;

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