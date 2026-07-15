// GHOSTBOT — MESSAGE HANDLER
const config = require("../../config");
const { extractText, isGroup, isPrivate, getSender, getChatId, getPushName } = require("../lib/utils");
const { commandHandler } = require("./commandHandler");
const { groupEventHandler } = require("./groupHandler");
const chalk = require("chalk");

global.__VIEW_ONCE_DB = global.__VIEW_ONCE_DB || {};

async function messageHandler(sock, m) {
  try {
    if (m.key.remoteJid === "status@broadcast") return;

    const chatId      = getChatId(m);
    const sender      = getSender(m);
    const pushName    = getPushName(m);
    const text        = extractText(m);
    const groupChat   = isGroup(m);
    const privateChat = isPrivate(m);

    if (!m.message) return;

    // ── Debale wrapper ephemeral/deviceSent ──────────────────────
    let rawMsg = m.message;
    if (rawMsg.ephemeralMessage?.message)   rawMsg = rawMsg.ephemeralMessage.message;
    if (rawMsg.deviceSentMessage?.message)  rawMsg = rawMsg.deviceSentMessage.message;

    const msgType = Object.keys(rawMsg)[0];
    if (msgType === "protocolMessage" || msgType === "senderKeyDistributionMessage") return;

    // ── NO AUTO-READ ─────────────────────────────────────────

    // View Once intercept
    if (msgType === "viewOnceMessage" || msgType === "viewOnceMessageV2" ||
        m.message[msgType]?.viewOnce === true) {
      global.__VIEW_ONCE_DB[m.key.id] = m;
    }

    // View Once bypass
    const cleanText = text ? text.trim().toLowerCase() : "";
    if (cleanText === "vv" || cleanText === `${config.PREFIX}vv`) {
      const quotedId = m.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (quotedId && global.__VIEW_ONCE_DB[quotedId]) {
        const saved = global.__VIEW_ONCE_DB[quotedId];
        const msgCopy = JSON.parse(JSON.stringify(saved.message));
        const type    = Object.keys(msgCopy)[0];
        if (type === "viewOnceMessage" || type === "viewOnceMessageV2") {
          const actualMsg  = msgCopy[type].message;
          const actualType = Object.keys(actualMsg)[0];
          if (actualMsg[actualType]) actualMsg[actualType].viewOnce = false;
          await sock.sendMessage(chatId, actualMsg, { quoted: m });
        } else {
          if (msgCopy[type]) msgCopy[type].viewOnce = false;
          await sock.sendMessage(chatId, msgCopy, { quoted: m });
        }
        return;
      }
    }

    // Group checks
    if (groupChat) {
      const gSettings = require("../lib/database").getGroupSettings(chatId);

      // Auto-React
      if (gSettings.autoReact && text && !text.startsWith(config.PREFIX)) {
        const emojis = ["👻","⚡","😈","🔥","✨","👀","👾","💜"];
        const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
        try { await sock.sendMessage(chatId, { react: { text: emoji, key: m.key } }); } catch(_) {}
      }

      // Bot enabled check
      if (gSettings.botEnabled === false) {
        const isOwner = config.OWNER_NUMBER.some(
          (n) => sender.includes(n) || sender.includes(n.replace(/^0+/, ""))
        );
        if (!isOwner) return;
      }

      if (msgType === "groupStatusMessage" || msgType === "groupNotificationMessage") {
        await groupEventHandler(sock, m);
        return;
      }
    }

    // Command routing
    if (text && text.startsWith(config.PREFIX)) {
      if (config.MODE === "private") {
        const isOwner   = config.OWNER_NUMBER.some(
          (n) => sender.includes(n) || sender.includes(n.replace(/^0+/, ""))
        );
        const isAllowed = config.ALLOWED_USERS.includes(sender);
        if (!isOwner && !isAllowed) return;
      }
      if (config.MODE === "group" && privateChat) {
        const isOwner = config.OWNER_NUMBER.some(
          (n) => sender.includes(n) || sender.includes(n.replace(/^0+/, ""))
        );
        if (!isOwner) return;
      }
      await commandHandler(sock, m, { text, sender, chatId, pushName, groupChat, privateChat });
    }

  } catch (e) {
    console.error(chalk.red(`[MSG HANDLER] ${e.message}`));
  }
}

module.exports = { messageHandler };
