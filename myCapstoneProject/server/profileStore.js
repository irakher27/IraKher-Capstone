/**
 * profileStore.js
 * -----------------
 * Persists each Google-logged-in person's last-submitted preferences
 * to data/userProfiles.json, keyed by their Google account email, so
 * "the interface saves what I put in" across visits/logins.
 *
 * Plain fs (not the filesystem MCP client) on purpose: this is
 * server-local persistence for the web layer, not part of the agent
 * pipeline's perceive/output steps that the MCP wiring covers.
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const STORE_PATH = path.join(__dirname, "..", "data", "userProfiles.json");

// Serializes writes so two near-simultaneous saves can't clobber each
// other (read-modify-write races) on this single JSON file.
let writeQueue = Promise.resolve();

async function readStore() {
  try {
    const raw = await fsp.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function getProfile(email) {
  const store = await readStore();
  return store[email] || null;
}

function saveProfile(email, persona) {
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    store[email] = { ...persona, updatedAt: new Date().toISOString() };
    await fsp.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
  });
  return writeQueue;
}

module.exports = { getProfile, saveProfile };
