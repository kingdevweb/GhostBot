// src/lib/apiSettings.js — Runtime API settings
const fs   = require("fs-extra");
const path = require("path");

const SETTINGS_FILE = path.join(
  process.env.DB_DIR || path.join(__dirname, "../../data"),
  "api-settings.json"
);

function loadApiSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return fs.readJsonSync(SETTINGS_FILE);
  } catch (_) {}
  return {};
}

function saveApiSettings(data) {
  fs.ensureFileSync(SETTINGS_FILE);
  const merged = { ...loadApiSettings() };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null && v !== "") merged[k] = v;
  }
  fs.writeJsonSync(SETTINGS_FILE, merged, { spaces: 2 });
  return merged;
}

function applyApiSettings() {
  const s = loadApiSettings();
  for (const [k, v] of Object.entries(s)) {
    if (v) process.env[k] = v;
  }
}

module.exports = { loadApiSettings, saveApiSettings, applyApiSettings };
