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
 */

require("dotenv").config(); // loads variables from your .env file

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_BASE_URL = "http://www.omdbapi.com/";

/**
 * Fetches a single movie by title from OMDb and reshapes it.
 * @param {string} title - the movie title to search for
 * @returns {Promise<Object|null>} a movie in {title, genres, platforms} shape, or null if not found
 */
async function fetchMovieByTitle(title) {
  const url = `${OMDB_BASE_URL}?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  // OMDb returns { Response: "False" } when it can't find the title
  if (data.Response === "False") {
    return null;
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
 * Fetches multiple movies by title in one call.
 * Skips any titles OMDb couldn't find, instead of crashing.
 * @param {string[]} titles - list of movie titles to fetch
 * @returns {Promise<Object[]>} array of movies in {title, genres, platforms} shape
 */
async function fetchMoviesByTitles(titles) {
  const results = await Promise.all(titles.map(fetchMovieByTitle));
  return results.filter((movie) => movie !== null); // drop any not-found titles
}

module.exports = { fetchMovieByTitle, fetchMoviesByTitles };