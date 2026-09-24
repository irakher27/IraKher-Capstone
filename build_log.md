# Build Log

## Running total (as of 2026-09-25)
- **Cumulative time: ~19 hours** across the whole project (Assessment 2 through today).
  - Note: the two entries below dated 2026-09-17 have identical text to the two
    dated 2026-09-18, and git history shows that work (Skill/adapter/agent
    loop/MCP wiring, then the viewers/onboarding-prep pass) was actually
    committed on 2026-09-18 — the real 2026-09-17 commits were an earlier,
    more primitive version. Treating this as a mis-dated duplicate and
    counting that ~4h once, not twice. Flag me if 2026-09-17 was actually a
    separate session and this should be corrected instead.
  - Breakdown: ~4h (2026-09-18) + ~6.5h (2026-09-19) + ~9h across five more
    sessions from 2026-09-22 through today (2026-09-25 — see entries below).
    Every session after 2026-09-19 is estimated the same way that one was:
    from git commit timestamp spans (first commit to last commit that day),
    which is a **lower bound** — it doesn't count investigation, testing, or
    thinking time before the first commit or between commits, and several of
    these sessions involved substantial waiting on external API calls
    (Watchmode/Gemini rate limits, multi-round verification batches) between
    commits that the raw span understates. Treat "~9h" as conservative, not
    precise.
- **Approx tokens used: not precisely tracked**, same as every entry below —
  there's no reliable way to pull actual token-usage numbers from inside a
  conversation, so this has never been a real measurement, just a placeholder.

## [2026-09-17]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Built the group movie-picker capstone Skill (scoreGroupMovies.js — hard-excludes any movie disliked by a persona, then scores and ranks the rest by group fit). Built an OMDb adapter to fetch and reshape real movie data. Built the agent loop (runWorkflow.js) implementing perceive → act → observe → reason → act again: loads persona profiles, fetches candidate movies from OMDb, scores them through the Skill, and retries with a loosened platform check when too few results survive. Wired in filesystem MCP so the agent reads persona files and writes results.json through the MCP connector rather than direct file I/O. Full workflow runs end-to-end on real persona input and produces real ranked movie output.

## [2026-09-17]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Added a .gitignore (.env, node_modules) and a Node package.json so the project actually installs and runs. Built three visualization layers on top of the existing pipeline: viewer.html (final ranked results as cards), process.html (a 6-step walkthrough — personas, fetched candidates, attempt 1 scoring with per-persona veto reasons, the agent's reasoning, attempt 2, final ranking), and site.html (the actual end-user journey — pick who's watching, animated "working" steps, ranked picks). Upgraded site.html so it's not just a mockup: the real scoreGroupMovies skill and the real fetched candidate movies are embedded and rerun live in the browser against whichever personas are checked, so different group selections genuinely produce different rankings. Renamed the five personas from generic "Persona N" labels to real names (Ira, Richa, Avani, Neela, Arunima) across the data files and every generated page. Started this build log.


## [2026-09-18]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Built the group movie-picker capstone Skill (scoreGroupMovies.js — hard-excludes any movie disliked by a persona, then scores and ranks the rest by group fit). Built an OMDb adapter to fetch and reshape real movie data. Built the agent loop (runWorkflow.js) implementing perceive → act → observe → reason → act again: loads persona profiles, fetches candidate movies from OMDb, scores them through the Skill, and retries with a loosened platform check when too few results survive. Wired in filesystem MCP so the agent reads persona files and writes results.json through the MCP connector rather than direct file I/O. Full workflow runs end-to-end on real persona input and produces real ranked movie output.

## [2026-09-18]
- Time spent: ~2 hour
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Added a .gitignore (.env, node_modules) and a Node package.json so the project actually installs and runs. Built three visualization layers on top of the existing pipeline: viewer.html (final ranked results as cards), process.html (a 6-step walkthrough — personas, fetched candidates, attempt 1 scoring with per-persona veto reasons, the agent's reasoning, attempt 2, final ranking), and site.html (the actual end-user journey — pick who's watching, animated "working" steps, ranked picks). Upgraded site.html so it's not just a mockup: the real scoreGroupMovies skill and the real fetched candidate movies are embedded and rerun live in the browser against whichever personas are checked, so different group selections genuinely produce different rankings. Renamed the five personas from generic "Persona N" labels to real names (Ira, Richa, Avani, Neela, Arunima) across the data files and every generated page. Started this build log.

## [2026-09-19]
- Time spent: ~6.5 hours (estimated from commit timestamps, 13:22–19:10, plus pre-commit and this finalization pass)
- Approx tokens used: ~X tokens across sessions, not precisely tracked
- What shipped: Expanded the candidate movie list to 159 titles and the recognized genre vocabulary (Musical, Autobiography, Horror, Romance, Comedy, Thriller, Sci-Fi, Action, Adventure, Drama, Fantasy — removed redundant RomCom/Raunchy Comedy since they're just Romance/Comedy combos). Fixed several real matching/logic bugs in scoreGroupMovies.js: previously-liked titles are now excluded from someone's own recommendations instead of being re-suggested, genre/title matching is case- and whitespace-insensitive, duplicate candidates are de-duplicated, and a real quota-vs-not-found ambiguity in the OMDb adapter (both were silently treated as "not found," hiding actual API failures) now throws a clear error. Added local caching for OMDb lookups so the same title is never re-fetched from the network twice, protecting against OMDb's 1,000-request/day free-tier limit. Replaced the static personas/*.json test files with a real multi-user onboarding flow: people sign in with Google (OAuth 2.0, via server/googleAuth.js), answer a short form (works solo or as a group, no hardcoded minimum), their preferences save to disk keyed by email (server/profileStore.js) and are editable anytime through a persistent profile badge/modal, and "Get recommendations" runs the exact same agent loop against whoever just answered — no static persona files involved. Made the app deployable: reads Railway's injected PORT and a configurable PUBLIC_BASE_URL/DATA_DIR instead of assuming localhost, added railway.toml, and wrote the project's README.md. Finished with a verification pass confirming the Skill/agent loop/MCP mechanism is still genuinely exercised by the live app and that the failure-handling from earlier (bad titles, empty results, already-liked exclusion) still works correctly end-to-end.

## [2026-09-22]
- Time spent: ~1 hour (estimated from commit timestamps, 21:47–22:19 — see the
  running-total note above on why this likely undercounts)
- Approx tokens used: not precisely tracked
- What shipped: Redesigned the results screen and the landing/login screen
  around a retro cinema-ticket theme, replacing the plain card list. Added
  rich per-movie metadata (poster, plot, director, actors, IMDb rating,
  language) to the OMDb adapter and Skill output so the UI had something
  real to put on a ticket. Built the ticket itself as an actual torn-stub
  shape — scalloped perforated-edge notches, a dashed divider, a colored
  accent stripe sampled from each poster's dominant color (falling back to a
  title-hash color when a poster is missing or the canvas read fails), rank
  badge, and a bottom "stub line" with match% and rating. Iterated the
  ticket's proportions twice to match a real ticket's short-and-wide aspect
  ratio instead of a tall banner. Redesigned the landing/login screen around
  a dark theater backdrop (CSS-approximated rows of dim seats) with a
  straight red ticket-stub title card instead of the earlier flat design.

## [2026-09-24, morning]
- Time spent: ~1 hour (estimated from commit timestamps, 02:16–03:22)
- Approx tokens used: not precisely tracked
- What shipped: A round of bug fixes reported from actually using the live
  app. Fixed genre-priority scoring (a movie matching more of a person's
  selected genres now reliably outranks one matching fewer, normalized
  against how many genres the person picked rather than how many tags OMDb
  happened to give the movie), relocated the action buttons, removed
  emojis, and fixed ticket proportions/spacing (center-aligning the group of
  5 result tickets, adding a gap before the action buttons, giving every
  ticket a fixed width and height so title length can't make one card a
  different size from the others). Fixed a title-matching bug where "Crazy,
  Stupid, Love" resolved to the wrong film on OMDb because of a missing
  trailing period plus a stale poisoned cache entry. Diagnosed and properly
  root-caused "Get new recommendations" doing nothing: the button and
  network call were never broken, but re-running the *original*
  recommendation logic is fully deterministic (same personas, same
  candidates, same scores, same sort) — clicking it just recomputed and
  re-displayed the identical top 5 every time. Rebuilt it as its own Skill,
  `skill/getFreshRecommendations.js`, which wraps the existing scoring rules
  with one more exclusion (titles already shown this session), backed by a
  new `POST /api/redo` endpoint — a second click can now only ever surface
  different movies, and correctly reports "no more matches" instead of
  silently showing a partial or repeated grid when the pool runs out. Added
  Animation and Bollywood as selectable genres — Animation matches OMDb's
  own tag directly; Bollywood has no OMDb industry/language tag at all, so
  it's matched against a new curated list (`data/bollywoodTitles.json`)
  instead via a `movie.isBollywood` flag, with matching titles added to the
  candidate pool. Also redesigned the detail-page ticket to fold
  genre/match%/rating directly onto the ticket under the title instead of a
  separate info bar above it.

## [2026-09-24, afternoon]
- Time spent: ~2.5 hours (estimated from commit timestamps, 13:37–16:08 —
  this session involved multiple multi-minute background batches of
  Watchmode API calls with deliberate pacing to respect its rate limits, so
  the real elapsed time was meaningfully longer than the commit span alone)
- Approx tokens used: not precisely tracked
- What shipped: Real streaming-platform data, replacing "we don't actually
  know where this is available." Added `adapters/watchmodeAdapter.js`
  (Watchmode API integration, cached like the OMDb adapter) and a "Watch
  Now" button on the movie detail page linking to the real platform a movie
  is on, falling back to direct search links on the major platforms when
  Watchmode has no data for a title at all (common for regional/Bollywood
  titles) instead of wrongly claiming "not available." Then went further:
  restricted the entire candidate pool to only movies actually confirmed
  streaming in India, via a new manually-run script,
  `agent/refreshIndiaAvailability.js`, which checks every non-Bollywood
  candidate against Watchmode and caches the result to
  `data/indiaAvailability.json` — the agent loop's candidate-fetch step now
  filters through this cache before scoring ever starts. Fixed "Watch Now"
  to cross-reference a movie's confirmed platform(s) against the platforms
  the *specific signed-in viewer* selected during onboarding, instead of
  just showing whatever Watchmode returned. Expanded the candidate pool
  significantly — added 5 new titles per genre across all 12 recognized
  genres, and replaced every existing title that Watchmode couldn't confirm
  as India-available with a real, verified, same-genre replacement
  (sourced and checked across several rounds of OMDb + Watchmode lookups;
  a small handful of Musical titles were removed with no replacement found
  despite exhaustive searching — documented plainly rather than papering
  over it). Also discovered and fixed a real OMDb tagging quirk while doing
  this: OMDb tags most movie-musicals "Music," not "Musical" (even a movie
  literally titled "Matilda: The Musical"), which was silently breaking the
  "Musical" preference for titles already in the pool (La La Land, Bohemian
  Rhapsody, Whiplash...) — added a `musical → Music` alias to
  `scoreGroupMovies.js`, mirroring the existing `autobiography → Biography`
  alias.

## [2026-09-25, early morning]
- Time spent: ~1 hour (estimated from commit timestamps, 01:16–02:29)
- Approx tokens used: not precisely tracked
- What shipped: A focused pass on the login/landing screen and a real bug
  fix. Removed the "Welcome To" eyebrow line so the title reads exactly
  "Book Your Movie," added a one-line tagline explaining what the app does,
  and removed the card/box styling around the sign-in button so it sits
  directly on the page, centered as a group with the title. Moved the
  "Sign in with Google" label below the button instead of above it, and
  sized the tagline clearly larger than that label. Along the way, found
  and fixed a real layout bug reported as "the preferences page renders
  beside the login page instead of replacing it": the login screen's own
  CSS rule declared `display: flex` unconditionally on an ID selector,
  which — by CSS specificity rules — beat the screen-switching logic's
  `display: none`/`display: block` class rule no matter what, so the login
  screen never actually hid itself once you signed in; it just kept
  rendering next to whatever screen became active. Fixed by scoping that
  rule to `#screen-login.active` so it only wins while the screen is
  genuinely the active one. Also restricted the streaming-platform list to
  exactly 5 options — Netflix, JioHotstar, Prime Video, Apple TV, SonyLIV
  (dropped Hulu and HBO Max, neither available in India; added SonyLIV) —
  and re-ran the India-availability check against the *entire* candidate
  pool with that stricter platform whitelist, not just new titles: 22 of
  300 titles turned out to be available in India only through a
  non-whitelisted source (a premium Amazon/Apple add-on channel, MUBI, VI
  movies and tv, etc.) and were removed; 19 got a real same-genre
  replacement confirmed on one of the 5 platforms, 3 were removed with no
  replacement found.

## [2026-09-25, this session]
- Time spent: ~1.5 hours (this session, not yet reflected in a commit-span
  estimate at time of writing)
- Approx tokens used: not precisely tracked
- What shipped: Received grading feedback that the project's one
  non-optional course requirement — genuine AI/LLM usage somewhere in the
  app, not just well-engineered deterministic automation — wasn't met. Every
  scoring/filtering decision up to this point was rules-based constraint
  satisfaction (hard-exclude vetoes, then rank by fixed weighted rules),
  which is a defensible, correct choice for *that specific* structured
  checkbox-driven part of the problem, but it meant zero LLM calls existed
  anywhere in the pipeline. Addressed it directly rather than just
  documenting a plan to: activated `GEMINI_API_KEY` (already present in the
  environment from earlier setup but never actually called by any code) and
  built the app's first real LLM integration. `adapters/geminiAdapter.js`
  takes the new optional free-text field on the onboarding form ("Anything
  else about your mood or taste?") and asks Gemini to infer extra
  liked/disliked genres from it, validated and re-canonicalized against the
  app's fixed genre vocabulary server-side rather than trusted blindly, then
  merged into that persona's existing `liked_genres`/`disliked_genres`
  before the existing deterministic Skill ever runs — real language
  understanding feeding a still-deterministic, still-testable scoring step,
  not replacing it. Verified with real (non-mocked) Gemini API calls: a note
  like "I love slow-burn mysteries but not in the mood for anything gory
  tonight, and I want something with singing and dancing" correctly
  produced `liked: [Musical], disliked: [Horror]`, and confirmed the
  deterministic pipeline actually acts on it (no Horror-tagged movie was
  recommended afterward). Also found a real operational constraint while
  testing: the Gemini free tier's current flash model caps out at roughly
  20 requests/day, which is fine for a live demo but not for heavy
  concurrent use — documented plainly in the README rather than glossed
  over, per the same "don't hide the gap" instruction that started this
  session. Fails soft throughout: no API key, a network error, a 503 (with
  a few quick retries first, since Gemini's own error message describes
  those as transient), or an unparsable response all just mean "no extra
  genres inferred," never a blocked submission. Rewrote README.md
  end-to-end for a reader with zero prior context — it had drifted well
  behind the app's actual state (no mention of Bollywood/Animation genres,
  Watchmode/India platform filtering, Watch Now, the redo Skill, or the
  retro ticket UI, and Gemini was listed as "not currently used") — and
  backfilled this build log with the four sessions of real, shipped work
  between 2026-09-19 and today that had never been logged.
