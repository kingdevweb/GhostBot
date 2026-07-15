// .ping
module.exports = {
  name: "ping",
  aliases: ["speed"],
  category: "fun",
  description: "Tès vitès bot la",
  usage: ".ping",

  async execute({ sock, m, chatId }) {
    const t0 = Date.now();
    await sock.sendMessage(chatId || m.key.remoteJid, { text: "⏳ K ap mezire..." }, { quoted: m });
    const ping = Date.now() - t0;
    await sock.sendMessage(chatId || m.key.remoteJid, {
      text: `┌─ [ 👻 *GHOSTBOT* 👻 ] ──\n│\n│⊙│ ⚡ *Ping:* ${ping}ms\n│⊙│ ✅ *Status:* RAPID!\n│\n└──────────────────────`
    }, { quoted: m });
  },
};
