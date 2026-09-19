# Group OTT Movie Picker

An agent that picks movies for a group of people instead of one person scrolling
forever. Everyone answers a few questions about what they like (genres, a
couple of favorite movies, which streaming platforms they have), and the agent
filters out anything anyone would veto, scores what's left against everyone's
taste at once, and hands back a ranked shortlist — a personal list if it's
just you, a negotiated group list if it's several people.

Live app: **[TODO: paste your Railway deployment URL here]**

---

## How it works, in one paragraph

A person's answers become a **persona** (`{ name, liked_genres, liked_titles,
disliked_genres, disliked_titles, platforms }`). The **agent loop**
(`agent/runWorkflow.js`) runs perceive → act → observe → reason → act again:
it loads personas, fetches real movie data for a fixed candidate list from
OMDb (`adapters/omdbAdapter.js`), scores everything through the **Skill**
(`skill/scoreGroupMovies.js` — hard-excludes anything anyone dislikes or has
already seen, then ranks the rest by group fit), and if too few movies survive
the first pass, retries with a loosened rule. Reading personas and writing the
final results goes through a **filesystem MCP server**
(`agent/mcpFilesystemClient.js`) instead of plain file I/O. A small **web
server** (`server/onboardingServer.js`) replaces hand-edited test personas
with a real form: people sign in with Google, answer the questions, and "Get
recommendations" runs that exact same agent loop against whoever just
answered.

## Project layout

```
myCapstoneProject/
  agent/
    runWorkflow.js        the agent loop (perceive/act/observe/reason/act again)
    mcpFilesystemClient.js talks to the filesystem MCP server
    traceWorkflow.js       same pipeline, but records why each movie was kept/cut (debug tool)
    render*.js             generate the static viewer.html / process.html / site.html debug pages
  skill/
    scoreGroupMovies.js    the actual filtering + scoring logic (no API calls, pure functions)
  adapters/
    omdbAdapter.js         fetches + reshapes movie data from OMDb, with local caching
  server/
    onboardingServer.js    the live web app: Google login, the onboarding form, /api/generate
    onboarding.html        the form/roster/results page served to the browser
    googleAuth.js          talks to Google's OAuth endpoints
    profileStore.js        saves each signed-in person's preferences to disk
  personas/                5 static test personas, used when you run the CLI directly
  data/
    candidateTitles.json   the fixed list of movie titles the agent considers
    results.json           latest output (regenerated every run)
    omdbCache.json          cached OMDb lookups (see "OMDb rate limits" below)
    userProfiles.json       saved preferences, keyed by Google email (gitignored — real user data)
```

## Requirements

- Node.js 18 or newer (uses the built-in global `fetch`)
- An [OMDb API key](https://www.omdbapi.com/apikey.aspx) (free tier is fine to start)
- A Google Cloud OAuth 2.0 Client ID (only needed for the live web app's login — see below)

## Setup (local)

```bash
cd myCapstoneProject
npm install
```

Create a `.env` file in `myCapstoneProject/` with:

```env
OMDB_API_KEY=your_omdb_key_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_SECRET=your_google_oauth_client_secret
PUBLIC_BASE_URL=http://localhost:4310
GEMINI_API_KEY=optional_currently_unused
```

| Variable | Required | What it's for |
|---|---|---|
| `OMDB_API_KEY` | Yes | Fetches real genre/title data for every candidate movie. Without it, nothing can be scored. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` | Yes, for the web app | Google OAuth credentials — this *is* how the onboarding form knows who you are, and it's the identity your saved preferences are keyed by. Get these from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID. |
| `PUBLIC_BASE_URL` | Yes, for the web app | The exact URL the app is reachable at (`http://localhost:4310` locally, your Railway domain in production). Used to build the OAuth callback URL — see below, this has to match exactly what's registered with Google. |
| `GEMINI_API_KEY` | No | Not currently called anywhere in the code. Reserved for an optional future feature (parsing free-text preferences with an LLM); the scoring engine itself is plain rule-based logic, no LLM involved. |

Nothing above is committed to the repo — `.env` is gitignored, as are the two
files that hold real people's data (`data/userProfiles.json`) and the OMDb
cache (`data/omdbCache.json` *is* actually committed, intentionally, to save
your API quota — delete it locally if you want a clean refetch).

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

## OMDb rate limits

OMDb's free tier caps out at 1,000 requests/day. Every fetched title is
cached to `data/omdbCache.json` so the same title is never re-fetched from
the network twice — but the first time you (or anyone) run this against a
new/expanded candidate list, expect one real request per new title. If you
see recommendations come back empty with an error mentioning "request limit
reached," that's OMDb's quota, not a bug — it resets daily.

## Deploying (Railway)

This repo is a monorepo — the actual Node app lives in `myCapstoneProject/`,
not the repo root. On Railway:

1. **Root Directory**: set to `myCapstoneProject` in the service's Settings.
2. **Volume**: add one mounted at `/data`, so saved profiles and the OMDb
   cache survive redeploys (Railway's default filesystem is wiped on every
   deploy otherwise).
3. **Environment variables**: all of the ones listed above, plus `DATA_DIR=/data`
   and `PUBLIC_BASE_URL` set to your Railway-assigned domain.
4. Add `<your Railway domain>/auth/google/callback` to your OAuth client's
   Authorized redirect URIs in Google Cloud Console — it has to match
   `PUBLIC_BASE_URL` exactly or login fails with `redirect_uri_mismatch`.

`railway.toml` (in `myCapstoneProject/`) already configures the Nixpacks
builder, `npm start` as the start command, and a health check on `/`.
