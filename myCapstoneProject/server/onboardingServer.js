/**
 * onboardingServer.js
 * ---------------------
 * Replaces the static personas/*.json test files with a real,
 * multi-user onboarding flow: each person signs in with Google first
 * (their account IS their profile — no anonymous/guest entry), then
 * answers a short form, one at a time, handing the device to the next
 * person. Once at least 1 has answered, "Get recommendations" runs
 * the real agent loop (agent/runWorkflow.js) against exactly the
 * people who just answered — no static persona files involved.
 * Works solo (personal picks) or as a group (negotiated picks).
 *
 * Plain Node `http`, no framework — this app is small enough not to
 * need one, and it avoids adding a new dependency for one server.
 */

require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { runWorkflow, runRedoWorkflow } = require("../agent/runWorkflow");
const { getStreamingAvailability, getSearchFallbackLinks, normalizePlatformName, cacheKey: watchmodeCacheKey, filterToAllowedPlatforms } = require("../adapters/watchmodeAdapter");
const { inferGenresFromFreeText } = require("../adapters/geminiAdapter");
const googleAuth = require("./googleAuth");
const profileStore = require("./profileStore");

// Railway (and most hosts) inject PORT — that takes priority over the
// local-dev-only ONBOARDING_PORT.
const PORT = process.env.PORT || process.env.ONBOARDING_PORT || 4310;
const PUBLIC_HTML_PATH = path.join(__dirname, "onboarding.html");

// Set PUBLIC_BASE_URL to your Railway domain (e.g.
// https://your-app.up.railway.app, no trailing slash) once deployed.
// Falls back to localhost for local dev.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const IS_HTTPS = PUBLIC_BASE_URL.startsWith("https://");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_SECRET = process.env.GOOGLE_SECRET;
const REDIRECT_URI = `${PUBLIC_BASE_URL}/auth/google/callback`;
if (!GOOGLE_CLIENT_ID || !GOOGLE_SECRET) {
  console.warn(
    "GOOGLE_CLIENT_ID / GOOGLE_SECRET missing from .env — Google sign-in will fail until both are set."
  );
}

// sessionId -> { email, name, picture }. In-memory on purpose: this is
// a local single-process dev tool, not a deployed multi-instance app.
const sessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (IS_HTTPS) parts.push("Secure");
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader("Set-Cookie", [...(res.getHeader("Set-Cookie") || []), parts.join("; ")]);
}

function clearCookie(res, name) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (IS_HTTPS) parts.push("Secure");
  res.setHeader("Set-Cookie", [...(res.getHeader("Set-Cookie") || []), parts.join("; ")]);
}

function currentUser(req) {
  const { session } = parseCookies(req);
  return session && sessions.has(session) ? sessions.get(session) : null;
}

// Same genre vocabulary the Skill recognizes (see skill/scoreGroupMovies.js).
// RomCom / Raunchy Comedy were removed — both are just Romance and/or
// Comedy already, which a person can select directly.
const GENRES = [
  "Musical", "Autobiography", "Horror", "Romance", "Comedy", "Thriller",
  "Sci-Fi", "Action", "Adventure", "Drama", "Fantasy", "Animation",
  // Bollywood isn't an OMDb genre tag — it's matched against a curated
  // title list instead (see data/bollywoodTitles.json + scoreGroupMovies.js).
  "Bollywood",
];
// Must match adapters/watchmodeAdapter.js's ALLOWED_PLATFORMS exactly
// — that's what actually gates the candidate pool and Watch Now.
const PLATFORMS = ["Netflix", "JioHotstar", "Prime Video", "Apple TV", "SonyLIV"];

// Same curated Bollywood list the recommendation pool trusts (see
// agent/runWorkflow.js) — Watch Now needs to know whether a title is
// Bollywood too, since those get a live Watchmode lookup regardless
// of the India-availability cache (see /api/streaming below).
const BOLLYWOOD_TITLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "bollywoodTitles.json"), "utf-8")
);
const BOLLYWOOD_TITLE_SET = new Set(BOLLYWOOD_TITLES.map((t) => t.trim().toLowerCase()));

function loadIndiaAvailabilityCache() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "indiaAvailability.json"), "utf-8"));
  } catch (err) {
    return {};
  }
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}

// Maps a submitted genre back to its canonical-cased entry in GENRES,
// case/whitespace-insensitively, dropping anything that isn't recognized.
function canonicalizeGenres(selected) {
  if (!Array.isArray(selected)) return [];
  return selected
    .map((g) => GENRES.find((canonical) => normalize(canonical) === normalize(g)))
    .filter(Boolean);
}

// In-memory group for the current onboarding round, keyed by the
// submitter's Google email so editing and re-saving your profile
// updates your one entry instead of adding a duplicate. One process =
// one group at a time, which matches "one person at a time answers,
// hand off to the next person."
const personasByEmail = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * The platforms to cross-reference Watch Now buttons against: the
 * currently-authenticated session's own persona (their platforms from
 * onboarding), since this is a shared-device app and that's the most
 * specific "the user" the server can identify for a given request. If
 * nobody's currently signed in (session expired, or the results
 * screen is being viewed after everyone's logged out), fall back to
 * the union of every platform anyone in the group selected, so the
 * feature still degrades usefully instead of matching nothing.
 */
function relevantUserPlatforms(req) {
  const user = currentUser(req);
  const persona = user && personasByEmail.get(user.email);
  if (persona) return persona.platforms;

  const union = new Set();
  for (const p of personasByEmail.values()) p.platforms.forEach((plat) => union.add(plat));
  return [...union];
}

function stateSnapshot() {
  const personas = [...personasByEmail.values()];
  return {
    count: personas.length,
    names: personas.map((p) => p.name),
    readyForResults: personas.length >= 1,
  };
}

/**
 * Validates a submitted person and reshapes it into exactly the
 * persona shape skill/scoreGroupMovies.js expects — no changes
 * needed there.
 */
function buildPersona(body) {
  const name = String(body.name || "").trim();
  if (!name) return { error: "Name is required." };

  const likedTitles = Array.isArray(body.liked_titles)
    ? body.liked_titles.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (likedTitles.length === 0) return { error: "At least one liked movie is required." };
  if (likedTitles.length > 3) return { error: "At most 3 liked movies." };

  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter((p) => PLATFORMS.includes(p))
    : [];
  if (platforms.length === 0) return { error: "At least one streaming platform is required." };

  const likedGenres = canonicalizeGenres(body.liked_genres);
  const dislikedGenres = canonicalizeGenres(body.disliked_genres);

  // Optional free-text mood/taste description — Gemini reads this in
  // the route handler below to infer extra genre signal beyond the
  // checkboxes (see adapters/geminiAdapter.js). Capped since it's
  // fed straight into an LLM prompt.
  const tasteNotes = String(body.taste_notes || "").trim().slice(0, 300);

  return {
    persona: {
      name,
      liked_genres: likedGenres,
      liked_titles: likedTitles,
      disliked_genres: dislikedGenres,
      disliked_titles: [],
      platforms,
      taste_notes: tasteNotes,
    },
  };
}

// Adds any genres Gemini inferred from persona.taste_notes into the
// persona's liked/disliked lists (deduped), and returns exactly what
// got added so the caller can log/surface it. A genre inferred as
// disliked is dropped from liked (and vice versa) if it was already
// there some other way — a hard exclusion should never silently
// coexist with a genre the same persona also claims to like.
async function applyGeminiGenreInference(persona) {
  if (!persona.taste_notes) return { likedAdded: [], dislikedAdded: [] };

  const inferred = await inferGenresFromFreeText(persona.taste_notes, GENRES);
  const likedSet = new Set(persona.liked_genres);
  const dislikedSet = new Set(persona.disliked_genres);

  const likedAdded = inferred.liked_genres.filter((g) => !likedSet.has(g) && !dislikedSet.has(g));
  const dislikedAdded = inferred.disliked_genres.filter((g) => !dislikedSet.has(g) && !likedSet.has(g));

  likedAdded.forEach((g) => likedSet.add(g));
  dislikedAdded.forEach((g) => dislikedSet.add(g));
  persona.liked_genres = [...likedSet];
  persona.disliked_genres = [...dislikedSet];

  return { likedAdded, dislikedAdded };
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (req.method === "GET" && pathname === "/") {
      const html = fs
        .readFileSync(PUBLIC_HTML_PATH, "utf-8")
        .replace("__ONBOARDING_CONFIG__", JSON.stringify({ genres: GENRES, platforms: PLATFORMS }));
      // No caching on the app shell — without this, a browser (or an
      // intermediate proxy) can keep serving an old cached copy of this
      // page after a redeploy, making a real fix look like it never
      // shipped even though the server has the new code.
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      });
      res.end(html);
      return;
    }

    if (req.method === "GET" && pathname === "/api/state") {
      return sendJson(res, 200, stateSnapshot());
    }

    if (req.method === "GET" && pathname === "/api/streaming") {
      const title = parsedUrl.searchParams.get("title");
      const year = parsedUrl.searchParams.get("year") || undefined;
      if (!title) return sendJson(res, 400, { ok: false, error: "title is required." });

      const isBollywood = BOLLYWOOD_TITLE_SET.has(title.trim().toLowerCase());

      let sources;
      try {
        if (isBollywood) {
          // Bollywood titles skip the India-availability cache (that
          // cache never gates them — see runWorkflow.js), but Watch
          // Now still benefits from a real per-title Watchmode lookup
          // when one exists (e.g. Dangal genuinely has Hotstar/Netflix
          // data) — this call is itself cached (watchmodeCache.json),
          // so it's not a live hit on every request.
          sources = await getStreamingAvailability(title, year);
        } else {
          // Non-Bollywood titles were already checked once when
          // data/indiaAvailability.json was built — reuse that instead
          // of re-hitting Watchmode. Falls back to a live lookup only
          // if this title somehow isn't in the cache yet (e.g. the
          // cache hasn't been refreshed since this title was added).
          const entry = loadIndiaAvailabilityCache()[watchmodeCacheKey(title, year)];
          sources = entry ? entry.platforms : await getStreamingAvailability(title, year);
        }
      } catch (err) {
        console.error(`Watchmode lookup failed for "${title}":`, err.message);
        sources = [];
      }

      // Belt-and-suspenders: whichever path produced `sources` above,
      // only the app's 5 supported platforms are ever allowed through
      // — e.g. the Bollywood live-lookup path returns Watchmode's full
      // unfiltered source list (Zee5, MX Player, Sony LIV, etc.).
      sources = filterToAllowedPlatforms(sources);

      // Watchmode's India catalog has real gaps (Bollywood/regional
      // titles especially) — an empty result means "Watchmode doesn't
      // know," not "not available," so offer search links on the
      // major platforms instead of telling the user it's unavailable.
      // (Unconfirmed by design, so not cross-referenced against the
      // user's platforms below — we don't know enough to filter it.)
      if (sources.length === 0) {
        return sendJson(res, 200, { ok: true, sources: getSearchFallbackLinks(title) });
      }

      // Confirmed available in India — but only worth a button if it's
      // also on a platform this user actually has.
      const userPlatforms = relevantUserPlatforms(req);
      const matched = sources.filter((s) => userPlatforms.includes(normalizePlatformName(s.platform)));
      if (matched.length === 0) {
        return sendJson(res, 200, { ok: true, sources: [], notOnUserPlatforms: true });
      }
      return sendJson(res, 200, { ok: true, sources: matched });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const user = currentUser(req);
      return sendJson(res, 200, user ? { loggedIn: true, ...user } : { loggedIn: false });
    }

    if (req.method === "GET" && pathname === "/api/profile") {
      const user = currentUser(req);
      if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in." });
      const profile = await profileStore.getProfile(user.email);
      return sendJson(res, 200, { ok: true, profile });
    }

    if (req.method === "GET" && pathname === "/auth/google") {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_SECRET) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        return res.end("Google sign-in isn't configured (missing GOOGLE_CLIENT_ID/GOOGLE_SECRET).");
      }
      const state = crypto.randomBytes(16).toString("hex");
      setCookie(res, "oauth_state", state, { maxAge: 300 });
      const authUrl = googleAuth.buildAuthUrl({
        clientId: GOOGLE_CLIENT_ID,
        redirectUri: REDIRECT_URI,
        state,
      });
      res.writeHead(302, { Location: authUrl });
      return res.end();
    }

    if (req.method === "GET" && pathname === "/auth/google/callback") {
      const { oauth_state } = parseCookies(req);
      const code = parsedUrl.searchParams.get("code");
      const state = parsedUrl.searchParams.get("state");

      if (!code || !state || state !== oauth_state) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        return res.end("Google sign-in failed: invalid or expired state. Go back and try again.");
      }

      const tokens = await googleAuth.exchangeCodeForTokens({
        code,
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_SECRET,
        redirectUri: REDIRECT_URI,
      });
      const userInfo = await googleAuth.fetchUserInfo(tokens.access_token);

      const sessionId = crypto.randomBytes(24).toString("hex");
      sessions.set(sessionId, {
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        picture: userInfo.picture || null,
      });
      clearCookie(res, "oauth_state");
      setCookie(res, "session", sessionId, { maxAge: 60 * 60 * 24 * 7 });
      console.log(`Signed in via Google: ${userInfo.email}`);

      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    if (req.method === "POST" && pathname === "/auth/logout") {
      const { session } = parseCookies(req);
      if (session) sessions.delete(session);
      clearCookie(res, "session");
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/personas") {
      const user = currentUser(req);
      if (!user) return sendJson(res, 401, { ok: false, error: "Sign in with Google first." });

      const body = await readJsonBody(req);
      const { persona, error } = buildPersona(body);
      if (error) return sendJson(res, 400, { ok: false, error });

      const { likedAdded, dislikedAdded } = await applyGeminiGenreInference(persona);
      if (likedAdded.length || dislikedAdded.length) {
        console.log(
          `Gemini inferred from "${persona.taste_notes}": ` +
          `liked +[${likedAdded.join(", ")}], disliked +[${dislikedAdded.join(", ")}]`
        );
      }

      const alreadyInRound = personasByEmail.has(user.email);
      personasByEmail.set(user.email, persona); // upsert — editing never duplicates
      console.log(
        `${alreadyInRound ? "Updated" : "Added"} persona "${persona.name}" ` +
        `(${personasByEmail.size} in the group so far).`
      );

      await profileStore.saveProfile(user.email, persona);
      console.log(`Saved preferences for ${user.email} for next time.`);

      return sendJson(res, 200, { ok: true, ...stateSnapshot(), geminiInferred: { liked: likedAdded, disliked: dislikedAdded } });
    }

    if (req.method === "POST" && pathname === "/api/generate") {
      if (personasByEmail.size < 1) {
        return sendJson(res, 400, {
          ok: false,
          error: "Add at least 1 person before generating recommendations.",
        });
      }
      const personas = [...personasByEmail.values()];
      console.log(`\n=== Running agent loop for ${personas.length} live-onboarded personas ===`);
      const results = await runWorkflow(personas.map((p) => ({ ...p })));
      return sendJson(res, 200, { ok: true, results, personaNames: personas.map((p) => p.name) });
    }

    if (req.method === "POST" && pathname === "/api/redo") {
      if (personasByEmail.size < 1) {
        return sendJson(res, 400, {
          ok: false,
          error: "Add at least 1 person before generating recommendations.",
        });
      }
      const body = await readJsonBody(req);
      const shownTitles = Array.isArray(body.shownTitles) ? body.shownTitles.map(String) : [];
      const personas = [...personasByEmail.values()];
      console.log(
        `\n=== Running getFreshRecommendations for ${personas.length} live-onboarded personas, ` +
        `excluding ${shownTitles.length} already-shown titles ===`
      );
      const results = await runRedoWorkflow(personas.map((p) => ({ ...p })), shownTitles);
      // Fewer than 5 means the remaining pool genuinely doesn't have 5
      // more matches left for this group — the client shows a clear
      // "no more matches" message instead of a partial/broken-looking grid.
      if (results.length < 5) {
        return sendJson(res, 200, { ok: true, insufficientMatches: true, personaNames: personas.map((p) => p.name) });
      }
      return sendJson(res, 200, { ok: true, results, personaNames: personas.map((p) => p.name) });
    }

    if (req.method === "POST" && pathname === "/api/reset") {
      personasByEmail.clear();
      console.log("Group reset — ready for a new round.");
      return sendJson(res, 200, { ok: true });
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    console.error("Request failed:", err);
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Onboarding server running at ${PUBLIC_BASE_URL} (listening on port ${PORT})`);
});
