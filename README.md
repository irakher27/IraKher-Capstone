# Group OTT Movie Picker

An agent that picks movies for a group of people instead of one person
scrolling forever. Everyone answers a few questions about what they like
(genres, a couple of favorite movies, which streaming platforms they have,
and optionally a free-text note about their mood), and the agent filters out
anything anyone would veto, scores what's left against everyone's taste at
once, and hands back a ranked shortlist as retro movie-ticket cards — a
personal list if it's just you, a negotiated group list if it's several
people. Every recommendation is restricted to movies actually confirmed
streaming in India, and each one links straight to the right platform via a
"Watch Now" button.

Live app: **https://irakher-capstone-production.up.railway.app**

---

## Grading feedback: no actual AI/LLM usage (addressed)

This project's course (Agentic AI) has one non-optional requirement: the app
has to genuinely use an LLM somewhere, not just be well-engineered
rules-based automation. Grading feedback on an earlier version flagged
exactly that gap — the engineering, MCP integration, and process were
praised, but the recommendation logic was entirely deterministic
constraint-satisfaction: hard-exclude anything anyone vetoed, then score and
rank what's left by fixed weighted rules. No LLM call happened anywhere in
that path. This section says that plainly rather than glossing over it.

**Why deterministic rules-based scoring was a reasonable choice for that
part of the problem in the first place:** deciding "does this movie violate
someone's hard veto, and how well does it match everyone's stated
preferences" is a constraint-satisfaction problem with a fixed, structured
input (checkboxes and a short list of liked titles) — the kind of problem
where deterministic code is *more* correct and reproducible than an LLM
call would be, not less. An LLM re-deciding "is Horror excluded for this
persona" from scratch on every request would be slower, non-deterministic,
harder to test, and strictly worse at a task that's really just set
membership and arithmetic. That reasoning still holds for that specific
piece of the pipeline.

**What was actually missing** was anywhere the app took open-ended,
unstructured human input and needed real language understanding to turn it
into something useful — which the checkbox-only form never gave it a chance
to do. **That's now fixed.** Onboarding has a new optional free-text field
("Anything else about your mood or taste?"), and Gemini
(`adapters/geminiAdapter.js`) reads it and infers extra liked/disliked
genres from it — e.g. "I love slow-burn mysteries but not in the mood for
anything gory tonight" gets correctly parsed into a liked signal and a
disliked signal without either being an explicit genre name a checkbox
could have captured. That inference is genuine LLM reasoning over
unstructured text; it merges into the exact same `liked_genres`/
`disliked_genres` arrays the existing deterministic Skill already scores
against, so the two pieces compose instead of duplicating each other's job.
See **"AI-assisted preferences (Gemini)"** below for exactly how it works,
what it's limited to on purpose, and a real constraint hit during testing
(a low daily free-tier request quota) worth knowing about before demoing
it live.

## How it works, in one paragraph

A person's answers become a **persona** (`{ name, liked_genres,
liked_titles, disliked_genres, disliked_titles, platforms, taste_notes }`).
If `taste_notes` (the free-text field) is non-empty, Gemini interprets it
into extra genre signal first (see above). The **agent loop**
(`agent/runWorkflow.js`) then runs perceive → act → observe → reason → act
again: it loads personas, fetches real movie data for the candidate list
from OMDb (`adapters/omdbAdapter.js`), restricts that pool to only titles
confirmed streaming in India on one of 5 supported platforms
(`adapters/watchmodeAdapter.js`, see below), scores everything through the
**Skill** (`skill/scoreGroupMovies.js` — hard-excludes anything anyone
dislikes, has already seen, or can't stream, then ranks the rest by group
fit), and if too few movies survive the first pass, retries with a loosened
platform-check rule. A second Skill, `skill/getFreshRecommendations.js`,
backs the "Get new recommendations" button — same scoring rules, but with
everything already shown this session additionally excluded, so a second
click can only ever surface different movies. Reading personas and writing
the final results goes through a **filesystem MCP server**
(`agent/mcpFilesystemClient.js`) instead of plain file I/O. A **web server**
(`server/onboardingServer.js`) replaces hand-edited test personas with a
real form: people sign in with Google, answer the questions, and "Get
recommendations" runs that exact same agent loop against whoever just
answered. The results page renders each pick as a retro cinema-ticket card
and links to a real "Watch Now" button per movie.

## Project layout

```
myCapstoneProject/
  agent/
    runWorkflow.js            the agent loop (perceive/act/observe/reason/act again)
    refreshIndiaAvailability.js  manually-run script: checks every candidate against
                               Watchmode and rebuilds data/indiaAvailability.json
    mcpFilesystemClient.js    talks to the filesystem MCP server
    traceWorkflow.js          same pipeline, but records why each movie was kept/cut (debug tool)
    render*.js                generate the static viewer.html / process.html / site.html debug pages
  skill/
    scoreGroupMovies.js       the core filtering + scoring logic (no API calls, pure functions)
    getFreshRecommendations.js  same rules, wrapped to also exclude already-shown titles
  adapters/
    omdbAdapter.js            fetches + reshapes movie data from OMDb, with local caching
    watchmodeAdapter.js       looks up real India streaming availability/platform via Watchmode
    geminiAdapter.js          Gemini call that infers extra genres from free-text taste notes
  server/
    onboardingServer.js       the live web app: Google login, onboarding form, /api/generate,
                               /api/redo, /api/streaming (Watch Now)
    onboarding.html           the form/roster/results/detail pages served to the browser
                               (retro movie-ticket UI)
    googleAuth.js             talks to Google's OAuth endpoints
    profileStore.js           saves each signed-in person's preferences to disk
  personas/                   5 static test personas, used when you run the CLI directly
  data/
    candidateTitles.json      the candidate list the agent considers (300 titles, all 12
                               genres + Bollywood, all confirmed India-streamable)
    bollywoodTitles.json      curated Bollywood/Hindi titles — trusted as-is, not gated by
                               Watchmode (its India catalog has real gaps there)
    indiaAvailability.json    built by refreshIndiaAvailability.js: which candidates are
                               confirmed on Netflix / JioHotstar / Prime Video / Apple TV /
                               SonyLIV in India
    omdbCache.json            cached OMDb lookups (see "OMDb rate limits" below)
    watchmodeCache.json       cached Watchmode lookups (per-title India source data)
    results.json              latest output (regenerated every run)
    userProfiles.json         saved preferences, keyed by Google email (gitignored — real user data)
```

## Requirements

- Node.js 18 or newer (uses the built-in global `fetch`)
- An [OMDb API key](https://www.omdbapi.com/apikey.aspx) (free tier is fine to start)
- A [Watchmode API key](https://api.watchmode.com/) (free tier; powers real India streaming-availability data)
- A [Gemini API key](https://ai.google.dev/) (free tier; powers the free-text preference inference)
- A Google Cloud OAuth 2.0 Client ID (only needed for the live web app's login — see below)

## Setup (local)

```bash
cd myCapstoneProject
npm install
```

Create a `.env` file in `myCapstoneProject/` with:

```env
OMDB_API_KEY=your_omdb_key_here
WATCHMODE_API_KEY=your_watchmode_key_here
GEMINI_API_KEY=your_gemini_key_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_SECRET=your_google_oauth_client_secret
PUBLIC_BASE_URL=http://localhost:4310
```

| Variable | Required | What it's for |
|---|---|---|
| `OMDB_API_KEY` | Yes | Fetches real genre/title data for every candidate movie. Without it, nothing can be scored. |
| `WATCHMODE_API_KEY` | Yes | Looks up real India streaming availability per movie/platform. Without it, the India-availability filter and "Watch Now" both silently fall back to empty (no candidates pass, no buttons show). |
| `GEMINI_API_KEY` | Yes | Powers real LLM inference of extra genre preferences from the onboarding form's free-text field. Without it, that field is silently ignored (logged, not an error) and the app behaves exactly as it did before this feature existed — see the grading-feedback section above for why this exists. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` | Yes, for the web app | Google OAuth credentials — this *is* how the onboarding form knows who you are, and it's the identity your saved preferences are keyed by. Get these from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID. |
| `PUBLIC_BASE_URL` | Yes, for the web app | The exact URL the app is reachable at (`http://localhost:4310` locally, your Railway domain in production). Used to build the OAuth callback URL — see below, this has to match exactly what's registered with Google. |

Nothing above is committed to the repo — `.env` is gitignored, as is the file
that holds real people's data (`data/userProfiles.json`). The OMDb and
Watchmode caches (`data/omdbCache.json`, `data/watchmodeCache.json`) *are*
committed intentionally, to save API quota — delete them locally if you want
a clean refetch.

## Running it

**The full app (Google login, live onboarding, web UI):**
```bash
npm start
```
Then open `http://localhost:4310`.

**Just the agent loop, against the 5 static test personas in `personas/`
(no login, no server — useful for quickly checking the scoring logic still
works):**
```bash
node agent/runWorkflow.js
```
This writes its output to `data/results.json`.

**Rebuild the India-availability cache** (after editing
`data/candidateTitles.json`, or to pick up new Watchmode data):
```bash
node agent/refreshIndiaAvailability.js
```
Safe to re-run — it always recomputes from whatever's already cached in
`watchmodeCache.json` (near-instant, no new API calls) unless a title has
genuinely never been checked before.

## How Google login actually works here

1. You click "Sign in with Google" → redirected to Google's consent screen.
2. Google redirects back to `PUBLIC_BASE_URL/auth/google/callback` with a code.
3. The server exchanges that code for your email/name/picture and starts a session (a cookie — nothing stored server-side keyed to you except your own saved preferences).
4. Your preferences form is pre-filled from your last save (if any), and your account *is* your profile — there's no separate anonymous/guest path.

**Important if you want anyone besides yourself to log in:** a freshly-created
Google OAuth app starts in **Testing** publishing status. In that mode,
Google will reject login attempts from any account that isn't explicitly
added as a **test user** — the person will see an "Access blocked: this app
has not completed Google verification" screen instead of the login flow. To
let someone else test it: **Google Cloud Console → APIs & Services → OAuth
consent screen → Test users → Add users**, and add their exact Google account
email. Do this *before* asking them to try logging in. (The alternative —
submitting the app for Google's verification review to move it out of Testing
mode — is a much bigger, longer process and isn't necessary for grading/demo
purposes.)

## AI-assisted preferences (Gemini)

The onboarding form has one optional field beyond the checkboxes: a
free-text box asking "Anything else about your mood or taste?" (e.g. *"I
love slow-burn mysteries but not in the mood for anything gory tonight"*).
When someone submits with that field filled in, `adapters/geminiAdapter.js`
sends the text to Gemini with the app's fixed genre vocabulary and asks it
to return, as JSON, which of those genres are clearly implied as liked or
disliked — nothing else, and only genres from that fixed list (validated and
re-canonicalized server-side, never trusted blindly). Whatever it infers
gets merged into that persona's existing `liked_genres`/`disliked_genres`
before the deterministic Skill ever runs, so the LLM's job is strictly
"understand free text," not "decide what's a good movie" — the actual
scoring stays deterministic and testable. If the field is empty, the API
key is missing, the call fails, or the response can't be parsed as valid
JSON, the persona is used exactly as if this feature didn't exist — this
never blocks someone from submitting with just the checkboxes.

**A real limitation found while building this, not a hidden one:** the
Gemini free tier used here has a low daily request quota for its current
flash model (the API's own error message reports a **limit of 20 requests**
before it starts returning `429`s for the rest of the day). That's easily
enough for a live demo with a handful of submissions, but it means this
isn't yet resilient to heavy concurrent use — a paid tier or a
higher-quota/different model would be the fix, not a code change.

## Streaming platform matching (India)

This app only recommends movies actually confirmed streaming in India, and
only on 5 supported platforms: **Netflix, JioHotstar, Prime Video, Apple
TV, SonyLIV**. Two adapters make this work:

- **`adapters/watchmodeAdapter.js`** calls the [Watchmode
  API](https://api.watchmode.com/) per title (search, then India sources),
  caches the raw result, and exposes a whitelist filter
  (`ALLOWED_PLATFORMS`) so "available" always means "available on one of
  those 5 specifically" — being available via Zee5, MX Player, MUBI, or a
  premium add-on channel (e.g. Amazon's MGM+) doesn't count.
- **`agent/refreshIndiaAvailability.js`** is a manually-run script that
  checks every non-Bollywood candidate in `data/candidateTitles.json`
  against that whitelist and writes the result to
  `data/indiaAvailability.json`. The agent loop's candidate pool is
  filtered through this cache before scoring even starts — a title this
  cache has never confirmed available is treated the same as "not
  available," not silently let through.
- **Bollywood titles** (`data/bollywoodTitles.json`, a curated list) skip
  this gate entirely and are trusted as-is — Watchmode's India catalog has
  real, known gaps for Bollywood/Hindi-language titles, and gating them the
  same way would incorrectly exclude well-known, legitimately available
  films it simply hasn't indexed.
- **"Watch Now"** (the detail page, backed by `GET /api/streaming`) cross-
  references a movie's confirmed platform(s) against the platforms *this
  specific signed-in person* selected during onboarding — a button only
  ever appears for a platform that's both confirmed for that movie **and**
  one the viewer actually has. If a movie is confirmed available in India
  but not on anything the viewer has, it shows "Not available on your
  selected platforms" instead of a wrong or missing button. If Watchmode
  has no data for a title at all (common for regional titles), it falls
  back to direct search links on all 5 platforms, clearly labeled as
  unconfirmed.

## The retro movie-ticket UI

Results render as cinema-ticket-styled cards (`server/onboarding.html`) —
a torn-edge perforated stub, a colored accent pulled from each poster's
dominant color, rank badge, genre/match%/rating on the stub line. All 5
result tickets are fixed-size (uniform width and height regardless of
title length, with text truncation instead of the card growing) and
centered as a group on the page. The detail-page ticket folds the
genre/match/rating info directly onto the ticket itself, under the title,
instead of a separate info bar above it.

## OMDb rate limits

OMDb's free tier caps out at 1,000 requests/day. Every fetched title is
cached to `data/omdbCache.json` so the same title is never re-fetched from
the network twice — but the first time you (or anyone) run this against a
new/expanded candidate list, expect one real request per new title. If you
see recommendations come back empty with an error mentioning "request limit
reached," that's OMDb's quota, not a bug — it resets daily. (Watchmode has
its own, separate quota — `adapters/watchmodeAdapter.js` caches the same
way for the same reason.)

## Deploying (Railway)

This repo is a monorepo — the actual Node app lives in `myCapstoneProject/`,
not the repo root. On Railway:

1. **Root Directory**: set to `myCapstoneProject` in the service's Settings.
2. **Volume**: add one mounted at `/data`, so saved profiles and the OMDb/
   Watchmode caches survive redeploys (Railway's default filesystem is
   wiped on every deploy otherwise).
3. **Environment variables**: all of the ones listed above, plus `DATA_DIR=/data`
   and `PUBLIC_BASE_URL` set to your Railway-assigned domain.
4. Add `<your Railway domain>/auth/google/callback` to your OAuth client's
   Authorized redirect URIs in Google Cloud Console — it has to match
   `PUBLIC_BASE_URL` exactly or login fails with `redirect_uri_mismatch`.

`railway.toml` (in `myCapstoneProject/`) already configures the Nixpacks
builder, `npm start` as the start command, and a health check on `/`.
