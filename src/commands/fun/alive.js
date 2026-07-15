// .alive — Format style screenshot KING DEV WEB
const path = require("path");
const fs   = require("fs-extra");

module.exports = {
  name: "alive",
  aliases: ["status", "bot"],
  category: "fun",
  description: "Tcheke si bot la vivan",
  usage: ".alive",

  async execute({ sock, m, config, pushName, chatId }) {
    const { getUptime } = require("../../lib/utils");

    const now    = new Date();
    const uptime = getUptime(global.__BOT_START_TIME || Date.now());
    const date   = now.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    const time   = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const mode   = config.MODE.charAt(0).toUpperCase() + config.MODE.slice(1);
    const modeIcon = config.MODE === "private" ? "🔒" : config.MODE === "group" ? "👥" : "🔓";

    const text =
`┌─ [ 👻 *GHOSTBOT* 👻 ] ──
│
│⊙│ 📅 *Date:* ${date}
│⊙│ 🕐 *Time:* ${time}
│⊙│ 👤 *User:* 👻 ${pushName} 👻
│⊙│ ⏱️ *Uptime:* ${uptime}
│⊙│ 🌐 *Mode:* ${mode} ${modeIcon}
│⊙│ ✅ *Status:* Online ✅
│⊙│ 💻 *Developer:* KING DEV WEB
│
└──────────────────────`;

    const jid = chatId || m.key.remoteJid;
    const logoPath = path.join(__dirname, "../../assets/ghostbot.png");

    try {
      if (fs.existsSync(logoPath)) {
        await sock.sendMessage(jid, {
          image: fs.readFileSync(logoPath),
          caption: text,
        }, { quoted: m });
        return;
      }
    } catch (_) {}

    await sock.sendMessage(jid, { text }, { quoted: m });
  },
};
