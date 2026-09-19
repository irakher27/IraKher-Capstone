/**
 * onboardingServer.js
 * ---------------------
 * Replaces the static personas/*.json test files with a real,
 * multi-user onboarding flow: people answer a short form one at a
 * time, and once at least 1 has answered, "Get recommendations"
 * runs the real agent loop (agent/runWorkflow.js) against exactly
 * the people who just answered — no static persona files involved.
 * Works solo (personal picks) or as a group (negotiated picks).
 *
 * Plain Node `http`, no framework — this app is small enough not to
 * need one, and it avoids adding a new dependency for one server.
 */

require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");

const { runWorkflow } = require("../agent/runWorkflow");

const PORT = process.env.ONBOARDING_PORT || 4310;
const PUBLIC_HTML_PATH = path.join(__dirname, "onboarding.html");

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
    if (req.method === "GET" && req.url === "/") {
      const html = fs
        .readFileSync(PUBLIC_HTML_PATH, "utf-8")
        .replace("__ONBOARDING_CONFIG__", JSON.stringify({ genres: GENRES, platforms: PLATFORMS }));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && req.url === "/api/state") {
      return sendJson(res, 200, stateSnapshot());
    }

    if (req.method === "POST" && req.url === "/api/personas") {
      const body = await readJsonBody(req);
      const { persona, error } = buildPersona(body);
      if (error) return sendJson(res, 400, { ok: false, error });

      personas.push(persona);
      console.log(`Added persona "${persona.name}" (${personas.length} in the group so far).`);
      return sendJson(res, 200, { ok: true, ...stateSnapshot() });
    }

    if (req.method === "POST" && req.url === "/api/generate") {
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

    if (req.method === "POST" && req.url === "/api/reset") {
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
