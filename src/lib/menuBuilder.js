// src/lib/menuBuilder.js — Format style screenshot KING DEV WEB
const config = require("../../config");

const CAT_ICONS = {
  ai:         "🤖",
  downloader: "📥",
  fun:        "🎮",
  group:      "👥",
  media:      "🎨",
  owner:      "👑",
  tools:      "🛠️",
  economy:    "💎",
  general:    "📋",
};

function buildMenu(commands, { pushName, uptime, totalCommands, isPremium }) {
  const now  = new Date();
  const date = now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const mode = config.MODE.charAt(0).toUpperCase() + config.MODE.slice(1);
  const modeIcon = config.MODE === "private" ? "🔒" : config.MODE === "group" ? "👥" : "🔓";

  const cats = {};
  for (const cmd of commands) {
    const cat = cmd.category || "general";
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(cmd.name);
  }

  let m = `┌─ [ 👻 *GHOSTBOT* 👻 ] ──\n`;
  m += `│\n`;
  m += `│⊙│ 📅 *Date:* ${date}\n`;
  m += `│⊙│ 🕐 *Time:* ${time}\n`;
  m += `│⊙│ 👤 *User:* 👻 ${pushName} 👻\n`;
  m += `│⊙│ ⏱️ *Uptime:* ${uptime}\n`;
  m += `│⊙│ 🌐 *Mode:* ${mode} ${modeIcon}\n`;
  m += `│⊙│ ✅ *Status:* Online ✅\n`;
  m += `│⊙│ 💻 *Developer:* KING DEV WEB\n`;
  m += `│\n`;
  m += `└──────────────────────\n\n`;

  for (const [cat, names] of Object.entries(cats)) {
    const icon = CAT_ICONS[cat] || "📋";
    m += `---| ${icon} *${cat.toUpperCase()} MENU* |---\n`;
    m += `┌─────────────────\n`;
    for (const name of names) {
      m += `|□ 👻 \`${config.PREFIX}${name}\`\n`;
    }
    m += `└─────────────────\n\n`;
  }

  m += `┌─────────────────────────────\n`;
  m += `│ 📊 *Total:* ${totalCommands} kòmand\n`;
  m += `│ 🔑 *Prefix:* \`${config.PREFIX}\`\n`;
  m += `│ 💎 *Statut:* ${isPremium ? "Premium ✅" : "Free"}\n`;
  m += `│ 💻 *Dev:* KING DEV WEB\n`;
  m += `└─────────────────────────────`;

  return m;
}

module.exports = { buildMenu };
