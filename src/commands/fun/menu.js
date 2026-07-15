// .menu — Format style screenshot avec logo
const path = require("path");
const fs   = require("fs-extra");

module.exports = {
  name: "menu",
  aliases: ["help", "cmds"],
  category: "fun",
  description: "Montre tout kòmand yo",
  usage: ".menu",

  async execute({ sock, m, config, pushName, getAllCommands, chatId }) {
    const { getUptime } = require("../../lib/utils");
    const { isPremium } = require("../../lib/database");
    const { buildMenu } = require("../../lib/menuBuilder");

    const allCmds = getAllCommands();
    const uptime  = getUptime(global.__BOT_START_TIME || Date.now());
    const premium = isPremium(m.key.participant || m.key.remoteJid);

    const text = buildMenu(allCmds, {
      pushName,
      uptime,
      totalCommands: allCmds.length,
      isPremium: premium,
    });

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
