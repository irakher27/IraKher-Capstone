# Skill: Score Group Movies

**What it does:** Takes a list of candidate movies and 5 persona
preference profiles. Removes anything any persona explicitly dislikes
or can't access, then scores and ranks what's left by group fit.

**When to use it:** After fetching candidate movies from a movie-data
API, before returning results to the group.

**Input:** array of movies `{title, genres, platforms}`, array of
5 personas.
**Output:** top N movies ranked by group score.

---
