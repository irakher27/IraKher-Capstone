/**
 * geminiAdapter.js
 * ------------------
 * ONE job: given a person's free-text description of what they're in
 * the mood for (e.g. "I love slow-burn mysteries but really don't
 * want anything gory tonight"), ask Gemini to interpret it into extra
 * liked/disliked genres from this app's existing genre vocabulary.
 *
 * This is the app's first genuine LLM usage — everything else in the
 * pipeline (scoreGroupMovies, the exclusion rules, platform matching)
 * is deterministic rules-based filtering, which was the right choice
 * for a constraint-satisfaction problem with a fixed structured
 * checkbox UI. But it means the app had no actual AI reasoning
 * anywhere — this adapter is step one of closing that gap. The
 * output feeds into the exact same liked_genres/disliked_genres
 * arrays the existing deterministic Skill already scores against
 * (see onboardingServer.js's buildPersona), so free-text reasoning
 * augments the structured pipeline instead of replacing it.
 *
 * Fails soft everywhere: no API key, a network error, an unparsable
 * response, or an empty/missing text field all just mean "no extra
 * genres inferred" — this never blocks someone from submitting their
 * preferences with just the checkboxes, same as before this existed.
 */

require("dotenv").config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// The "-latest" alias tracks Google's current recommended flash model
// instead of pinning a specific version — avoids hardcoding a model
// name that gets deprecated (already happened once during setup) and
// tends to be more available than a brand-new model under launch load.
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Pulls the first {...} JSON object out of a Gemini text response,
 * tolerating markdown code fences (```json ... ```) since the model
 * sometimes wraps its answer in one despite being asked not to.
 */
function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    return null;
  }
}

/**
 * @param {string} freeText - what the person typed about their mood/taste
 * @param {string[]} validGenres - the app's recognized genre vocabulary (GENRES in onboardingServer.js)
 * @returns {Promise<{liked_genres: string[], disliked_genres: string[]}>}
 */
async function inferGenresFromFreeText(freeText, validGenres) {
  const empty = { liked_genres: [], disliked_genres: [] };
  const text = String(freeText || "").trim();
  if (!text) return empty;

  if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set — skipping free-text preference inference.");
    return empty;
  }

  const prompt =
    `You infer movie genre preferences from a short piece of free text someone wrote ` +
    `about what they're in the mood to watch. Valid genres (use these exact strings, ` +
    `nothing else): ${validGenres.join(", ")}.\n\n` +
    `Text: "${text.replace(/"/g, '\\"')}"\n\n` +
    `Return ONLY a JSON object of this exact shape, no commentary, no markdown:\n` +
    `{"liked_genres": [...], "disliked_genres": [...]}\n\n` +
    `Only include a genre if the text clearly and unambiguously implies it. If nothing ` +
    `is clearly implied for a list, return an empty array for it. A genre must never ` +
    `appear in both lists.`;

  try {
    // Gemini's free tier returns a transient 503 ("high demand ...
    // usually temporary") often enough in practice to be worth a
    // couple of quick retries before giving up and falling back.
    let data;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      data = await response.json();

      if (!data.error) break;
      const retryable = response.status === 503 || response.status === 429;
      if (!retryable || attempt === maxAttempts) {
        console.warn(`Gemini free-text inference failed: ${data.error.message || response.status}`);
        return empty;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }

    const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = extractJsonObject(rawText);
    if (!parsed) {
      console.warn("Gemini free-text inference: couldn't parse a JSON object out of the response.");
      return empty;
    }

    // Map back to the app's own canonical casing rather than trusting
    // whatever casing the model returned, even though it was asked
    // to use the exact strings — same defensive pattern as
    // onboardingServer.js's canonicalizeGenres().
    const byLowercase = new Map(validGenres.map((g) => [g.toLowerCase(), g]));
    const sanitize = (list) =>
      Array.isArray(list)
        ? [...new Set(list.map((g) => byLowercase.get(String(g).trim().toLowerCase())).filter(Boolean))]
        : [];

    return {
      liked_genres: sanitize(parsed.liked_genres),
      disliked_genres: sanitize(parsed.disliked_genres),
    };
  } catch (err) {
    console.warn(`Gemini free-text inference failed: ${err.message}`);
    return empty;
  }
}

module.exports = { inferGenresFromFreeText };
