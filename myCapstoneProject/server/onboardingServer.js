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

const { runWorkflow } = require("../agent/runWorkflow");
const googleAuth = require("./googleAuth");
const profileStore = require("./profileStore");

const PORT = process.env.ONBOARDING_PORT || 4310;
const PUBLIC_HTML_PATH = path.join(__dirname, "onboarding.html");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_SECRET = process.env.GOOGLE_SECRET;
const REDIRECT_URI = `http://localhost:${PORT}/auth/google/callback`;
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
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader("Set-Cookie", [...(res.getHeader("Set-Cookie") || []), parts.join("; ")]);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", [
    ...(res.getHeader("Set-Cookie") || []),
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ]);
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
  "Sci-Fi", "Action", "Adventure", "Drama", "Fantasy",
];
const PLATFORMS = ["Netflix", "Prime Video", "Disney+ Hotstar", "Hulu", "HBO Max", "Apple TV+"];

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

// In-memory group for the current onboarding round. One process =
// one group at a time, which matches "one person at a time answers,
// hand off to the next person."
let personas = [];

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

function stateSnapshot() {
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

  return {
    persona: {
      name,
      liked_genres: likedGenres,
      liked_titles: likedTitles,
      disliked_genres: dislikedGenres,
      disliked_titles: [],
      platforms,
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (req.method === "GET" && pathname === "/") {
      const html = fs
        .readFileSync(PUBLIC_HTML_PATH, "utf-8")
        .replace("__ONBOARDING_CONFIG__", JSON.stringify({ genres: GENRES, platforms: PLATFORMS }));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && pathname === "/api/state") {
      return sendJson(res, 200, stateSnapshot());
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

      personas.push(persona);
      console.log(`Added persona "${persona.name}" (${personas.length} in the group so far).`);

      await profileStore.saveProfile(user.email, persona);
      console.log(`Saved preferences for ${user.email} for next time.`);

      return sendJson(res, 200, { ok: true, ...stateSnapshot() });
    }

    if (req.method === "POST" && pathname === "/api/generate") {
      if (personas.length < 1) {
        return sendJson(res, 400, {
          ok: false,
          error: "Add at least 1 person before generating recommendations.",
        });
      }
      console.log(`\n=== Running agent loop for ${personas.length} live-onboarded personas ===`);
      const results = await runWorkflow(personas.map((p) => ({ ...p })));
      return sendJson(res, 200, { ok: true, results, personaNames: personas.map((p) => p.name) });
    }

    if (req.method === "POST" && pathname === "/api/reset") {
      personas = [];
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
  console.log(`Onboarding server running at http://localhost:${PORT}`);
});
