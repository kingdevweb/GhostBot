// ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
// ┃         GhostBot — CONFIG v7.0.1 | Developer: KING DEV WEB               ┃
// ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

try {
  const { applyApiSettings } = require("./src/lib/apiSettings");
  applyApiSettings();
} catch (_) {}

module.exports = {
  BOT_NAME:     process.env.BOT_NAME     || "GhostBot",
  OWNER_NAME:   process.env.OWNER_NAME   || "King Fixed",
  OWNER_NUMBER: (process.env.OWNER_NUMBER || "50955394345").split(",").map(n => n.trim()),
  PREFIX:       process.env.PREFIX       || ".",
  MODE:          process.env.BOT_MODE   || "public",
  ALLOWED_USERS: [],
  AUTO_READ:          false,
  AUTO_TYPING:        false,
  AUTO_RECORDING:     false,
  AUTO_STATUS_READ:   false,
  AUTO_BIO:           false,
  ALWAYS_ONLINE:      true,
  WELCOME:       true,
  GOODBYE:       true,
  ANTI_LINK:     false,
  ANTI_SPAM:     true,
  ANTI_BADWORD:  false,
  ANTI_DELETE:   false,
  ANTI_BOT:      false,
  ANTI_VIRTEX:   true,
  MUTE_DURATION: 300,
  COOLDOWN_ENABLED:  true,
  COOLDOWN_DURATION: 3000,
  DISABLED_COMMANDS: [],
  OPENAI_API_KEY:      process.env.OPENAI_API_KEY      || "",
  GEMINI_API_KEY:      process.env.GEMINI_API_KEY       || "",
  AI_PROVIDER:         process.env.AI_PROVIDER          || "gemini",
  YTDL_API:            process.env.YTDL_API             || "",
  TIKTOK_API:          process.env.TIKTOK_API           || "",
  REMOVEBG_API_KEY:    process.env.REMOVEBG_API_KEY     || "",
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY  || "",
  OCR_API_KEY:         process.env.OCR_API_KEY          || "",
  STICKER_PACK:               process.env.STICKER_PACK   || "GhostBot",
  STICKER_AUTHOR:             process.env.STICKER_AUTHOR || "King Fixed",
  STICKER_MAX_VIDEO_DURATION: 10,
  TIMEZONE: process.env.TIMEZONE || "America/Port-au-Prince",
  LANGUAGE: process.env.LANGUAGE || "ht",
  ENABLE_REACTIONS:    true,
  SUCCESS_REACTION:    "✅",
  ERROR_REACTION:      "❌",
  PROCESSING_REACTION: "⏳",
  DAILY_REWARD:     500,
  WORK_MIN:         200,
  WORK_MAX:         800,
  STARTING_BALANCE: 1000,
  CURRENCY_SYMBOL:  "💎",
  SESSION_DIR:      process.env.SESSION_DIR || "./session",
  USE_PAIRING_CODE: process.env.USE_PAIRING_CODE !== "false",
};
