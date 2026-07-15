// ╔══════════════════════════════════════════════════════════════════════════╗
// ║         👻  GhostBot v7.0.1 — WhatsApp Multi-Device Bot                ║
// ║         Developer: KING DEV WEB  |  Admin: kfixed91@gmail.com          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const pino    = require("pino");
const chalk   = require("chalk");
const path    = require("path");
const fs      = require("fs-extra");
const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const QRCode  = require("qrcode");
const crypto  = require("crypto");

// Apply saved API settings FIRST
try { require("./src/lib/apiSettings").applyApiSettings(); } catch(_) {}

const config  = require("./config");
const { messageHandler }              = require("./src/handler/message");
const { ensureDB, getBotSetting }     = require("./src/lib/database");
const { loadCommands, getAllCommands } = require("./src/handler/commandHandler");
const { loadApiSettings, saveApiSettings } = require("./src/lib/apiSettings");

// ═══════════════════════════════════════════════════════════════
// ADMIN AUTH CONFIG
// ═══════════════════════════════════════════════════════════════
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "kfixed91@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "GhostBot2026!";
// Active sessions: token → { email, createdAt }
const SESSIONS = new Map();

function genToken() {
  return crypto.randomBytes(32).toString("hex");
}
function isAuthed(req) {
  const token = req.headers["x-auth-token"] || req.cookies?.["gb_token"];
  return token && SESSIONS.has(token);
}
// Simple cookie parser
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k.trim()] = decodeURIComponent(v.join("="));
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
ensureDB();
const savedMode = getBotSetting("botMode");
if (savedMode) config.MODE = savedMode;

global.__BOT_START_TIME = Date.now();
global.__BOT_STATE = {
  connection: "close",
  qr: null, pairingCode: null, phoneNumber: null,
  userJid: null, userName: null, logs: [],
  stats: { messagesProcessed: 0, commandsExecuted: 0, errors: 0 },
};

let sock = null;
global.__sock = null;
let reconnectAttempts   = 0;
let reconnectTimer      = null;
let isManualDisconnect  = false;
let isPairingMode       = false;
let pairingPhoneNumber  = null;
let keepAliveTimer      = null;

function addLog(level, msg) {
  const entry = { time: new Date().toISOString(), level, msg };
  global.__BOT_STATE.logs.unshift(entry);
  if (global.__BOT_STATE.logs.length > 300) global.__BOT_STATE.logs.pop();
  if (global.__io) global.__io.emit("log", entry);
}

// ═══════════════════════════════════════════════════════════════
// WEB SERVER
// ═══════════════════════════════════════════════════════════════
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
global.__io  = io;
const PORT   = process.env.PORT || 3000;

app.use(express.json());

// Inject cookie parser
app.use((req, _res, next) => { req.cookies = parseCookies(req); next(); });

// ── AUTH ENDPOINTS (public) ──────────────────────────────────
app.get("/", (req, res) => {
  if (isAuthed(req)) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "web", "login.html"));
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (
    email?.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
    password === ADMIN_PASSWORD
  ) {
    const token = genToken();
    SESSIONS.set(token, { email, createdAt: Date.now() });
    res.setHeader("Set-Cookie", `gb_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    addLog("info", `🔐 Login réussi: ${email}`);
    return res.json({ ok: true });
  }
  addLog("warn", `⚠️ Tentative login échouée: ${email}`);
  return res.status(401).json({ ok: false, msg: "Email oswa modpas pa kòrèk" });
});

app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.["gb_token"];
  if (token) SESSIONS.delete(token);
  res.setHeader("Set-Cookie", "gb_token=; Path=/; HttpOnly; Max-Age=0");
  res.json({ ok: true });
});

// ── AUTH MIDDLEWARE (pou tout /dashboard + /api) ─────────────
function requireAuth(req, res, next) {
  const token = req.cookies?.["gb_token"] || req.headers["x-auth-token"];
  if (token && SESSIONS.has(token)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ ok: false, msg: "Non autorisé" });
  res.redirect("/");
}

// ── DASHBOARD ────────────────────────────────────────────────
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

// Static assets (logo, etc.) — public
app.use("/socket.io", requireAuth, express.static(path.join(__dirname, "node_modules/socket.io/client-dist")));
app.use(express.static(path.join(__dirname, "web")));

// ── API: state ───────────────────────────────────────────────
app.get("/api/state", requireAuth, (req, res) => {
  res.json({
    ...global.__BOT_STATE,
    config: { BOT_NAME: config.BOT_NAME, OWNER_NAME: config.OWNER_NAME, PREFIX: config.PREFIX, MODE: config.MODE },
    uptime: Math.floor((Date.now() - global.__BOT_START_TIME) / 1000),
    totalCommands: getAllCommands().length,
  });
});

// ── API: restart ─────────────────────────────────────────────
app.post("/api/restart", requireAuth, (req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(1), 800);
});

// ── API: pairing ─────────────────────────────────────────────
app.post("/api/pairing", requireAuth, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.json({ ok: false, msg: "Missing phone number" });
  isPairingMode      = true;
  pairingPhoneNumber = phoneNumber.replace(/\D/g, "");
  addLog("info", `Pairing requested for +${pairingPhoneNumber}`);
  global.__BOT_STATE.phoneNumber = pairingPhoneNumber;
  global.__BOT_STATE.pairingCode = null;
  global.__BOT_STATE.qr          = null;
  global.__BOT_STATE.connection  = "connecting";
  io.emit("connectionState", { state: "connecting" });
  if (sock) { try { sock.ev.removeAllListeners(); } catch(_){} try { sock.end(); } catch(_){} sock = null; global.__sock = null; }
  try { fs.removeSync(config.SESSION_DIR); fs.ensureDirSync(config.SESSION_DIR); } catch(_){}
  res.json({ ok: true, msg: "Pairing en kour…" });
  await new Promise(r => setTimeout(r, 1200));
  reconnectAttempts = 0; startBot();
});

// ── API: logout WhatsApp ─────────────────────────────────────
app.post("/api/logout", requireAuth, async (req, res) => {
  isManualDisconnect = true; isPairingMode = false; pairingPhoneNumber = null;
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  if (sock) { try{sock.ev.removeAllListeners();}catch(_){} try{await sock.logout();}catch(_){} try{sock.end();}catch(_){} sock = null; global.__sock = null; }
  try { fs.removeSync(config.SESSION_DIR); fs.ensureDirSync(config.SESSION_DIR); } catch(_){}
  global.__BOT_STATE = { ...global.__BOT_STATE, connection:"close", qr:null, pairingCode:null, phoneNumber:null, userJid:null, userName:null };
  io.emit("connectionState", { state: "close" });
  addLog("info", "Logged out — session cleared");
  res.json({ ok: true });
  setTimeout(() => { isManualDisconnect = false; reconnectAttempts = 0; startBot(); }, 2000);
});

// ── API: commands ─────────────────────────────────────────────
app.get("/api/commands", requireAuth, (req, res) => {
  const all  = getAllCommands();
  const cats = {};
  for (const cmd of all) {
    if (!cats[cmd.category]) cats[cmd.category] = [];
    cats[cmd.category].push({ name: cmd.name, aliases: cmd.aliases, description: cmd.description, ownerOnly: cmd.ownerOnly, premiumOnly: cmd.premiumOnly });
  }
  res.json({ total: all.length, categories: cats });
});

// ── API: groups GET ───────────────────────────────────────────
app.get("/api/groups", requireAuth, async (req, res) => {
  if (global.__BOT_STATE.connection !== "open" || !sock)
    return res.json({ ok: false, msg: "Bot la pa konekte", groups: [] });
  try {
    const groups  = await sock.groupFetchAllParticipating();
    const { getGroupSettings } = require("./src/lib/database");
    const list = Object.values(groups).map(g => {
      const s = getGroupSettings(g.id);
      return { id: g.id, subject: g.subject, size: g.participants?.length||0,
               botEnabled: s.botEnabled !== false, autoReact: s.autoReact === true };
    });
    res.json({ ok: true, groups: list });
  } catch(e) { res.json({ ok: false, error: e.message, groups: [] }); }
});

// ── API: groups TOGGLE ────────────────────────────────────────
app.post("/api/groups/toggle", requireAuth, (req, res) => {
  const { id, setting } = req.body;
  if (!id || !setting) return res.json({ ok: false, msg: "Manke paramèt" });
  const { getGroupSettings, saveGroupSettings } = require("./src/lib/database");
  const s = getGroupSettings(id); const val = !s[setting];
  saveGroupSettings(id, { [setting]: val });
  addLog("info", `Gwoup ${id}: ${setting}=${val}`);
  res.json({ ok: true, newVal: val });
});

// ── API: settings GET ─────────────────────────────────────────
app.get("/api/settings", requireAuth, (req, res) => {
  try {
    const saved = loadApiSettings();
    // Email aktif la (sove oswa env var) — voye kache (masked)
    const activeEmail = saved.ADMIN_EMAIL || process.env.ADMIN_EMAIL || ADMIN_EMAIL;
    // Mask: montre sèlman 3 premye karaktè + *** + @domain
    function maskEmail(e) {
      const [u, d] = e.split("@");
      if (!d) return "***";
      return u.slice(0, 3) + "***@" + d;
    }
    res.json({
      ok: true,
      settings: {
        AI_PROVIDER:         saved.AI_PROVIDER        || process.env.AI_PROVIDER        || "gemini",
        MODE:                saved.BOT_MODE            || process.env.BOT_MODE            || config.MODE,
        PREFIX:              saved.PREFIX              || process.env.PREFIX              || config.PREFIX,
        // Email retounen kòm valè konplè (sèlman admin ki ka wè l)
        ADMIN_EMAIL_MASKED:  activeEmail,
        GEMINI_CONFIGURED:  !!(saved.GEMINI_API_KEY   || process.env.GEMINI_API_KEY),
        OPENAI_CONFIGURED:  !!(saved.OPENAI_API_KEY   || process.env.OPENAI_API_KEY),
        TIKTOK_CONFIGURED:  !!(saved.TIKTOK_API       || process.env.TIKTOK_API),
        YTDL_CONFIGURED:    !!(saved.YTDL_API         || process.env.YTDL_API),
        REMOVEBG_CONFIGURED:!!(saved.REMOVEBG_API_KEY || process.env.REMOVEBG_API_KEY),
        WEATHER_CONFIGURED: !!(saved.OPENWEATHER_API_KEY || process.env.OPENWEATHER_API_KEY),
      },
    });
  } catch(e) { res.json({ ok: false, msg: e.message }); }
});

// ── API: settings POST ────────────────────────────────────────
app.post("/api/settings", requireAuth, (req, res) => {
  try {
    const allowed = ["AI_PROVIDER","GEMINI_API_KEY","OPENAI_API_KEY","TIKTOK_API","YTDL_API",
                     "REMOVEBG_API_KEY","OPENWEATHER_API_KEY","OCR_API_KEY","BOT_MODE","PREFIX",
                     "BOT_NAME","ADMIN_EMAIL","ADMIN_PASSWORD"];
    const payload = {};
    for (const k of allowed) { if (req.body[k]) payload[k] = req.body[k]; }
    if (req.body.MODE) payload.BOT_MODE = req.body.MODE;
    saveApiSettings(payload);
    // Aktyalize ADMIN_EMAIL + ADMIN_PASSWORD yo nan memwa osi
    if (payload.ADMIN_EMAIL)    process.env.ADMIN_EMAIL    = payload.ADMIN_EMAIL;
    if (payload.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = payload.ADMIN_PASSWORD;
    // Efase tout sesyon si email/modpas chanje (obligatwa rekonekte)
    if (payload.ADMIN_EMAIL || payload.ADMIN_PASSWORD) {
      SESSIONS.clear();
      addLog("info", "🔐 Email/modpas chanje — tout sesyon efase");
    }
    addLog("info", `⚙️ Settings: ${Object.keys(payload).join(", ")}`);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, msg: e.message }); }
});

// ── Socket.IO — auth via cookie ───────────────────────────────
io.use((socket, next) => {
  const cookies = parseCookies({ headers: { cookie: socket.handshake.headers.cookie } });
  const token   = cookies["gb_token"] || socket.handshake.auth?.token;
  if (token && SESSIONS.has(token)) return next();
  next(new Error("Unauthorized"));
});

io.on("connection", socket => {
  socket.emit("state", {
    ...global.__BOT_STATE,
    uptime: Math.floor((Date.now() - global.__BOT_START_TIME) / 1000),
    totalCommands: getAllCommands().length,
    config: { BOT_NAME: config.BOT_NAME, PREFIX: config.PREFIX, MODE: config.MODE },
  });
  socket.on("requestState", () => socket.emit("state", {
    ...global.__BOT_STATE,
    uptime: Math.floor((Date.now() - global.__BOT_START_TIME) / 1000),
    totalCommands: getAllCommands().length,
  }));
});

// ═══════════════════════════════════════════════════════════════
// PROCESS HANDLERS
// ═══════════════════════════════════════════════════════════════
process.on("uncaughtException",  e => { addLog("error", `Uncaught: ${e.message}`); console.error(e); });
process.on("unhandledRejection", r => { addLog("error", `Rejection: ${String(r)}`); });
process.on("SIGINT",  () => { if(sock) try{sock.end();}catch(_){} process.exit(0); });
process.on("SIGTERM", () => { if(sock) try{sock.end();}catch(_){} process.exit(0); });

// ═══════════════════════════════════════════════════════════════
// BOT — Koneksyon Pèmanan
// ═══════════════════════════════════════════════════════════════
async function startBot() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  addLog("info", `🚀 Démaraje GhostBot (tentativ #${reconnectAttempts + 1})`);

  try {
    ensureDB();
    fs.ensureDirSync(config.SESSION_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
    if (!isPairingMode && state.creds.registered) addLog("info", "✅ Sesyon egziste — ap restore…");
    const { version } = await fetchLatestBaileysVersion();

    if (sock) { try{sock.ev.removeAllListeners();}catch(_){} try{sock.end();}catch(_){} sock=null; global.__sock=null; }

    sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
      printQRInTerminal: !isPairingMode,
      browser: Browsers.ubuntu("Chrome"),
      logger: pino({ level: "silent" }),
      keepAliveIntervalMs:   15_000,
      connectTimeoutMs:      60_000,
      defaultQueryTimeoutMs: undefined,
      retryRequestDelayMs:   250,
      maxMsgRetryCount:      5,
      emitOwnEvents:         false,
      markOnlineOnConnect:   true,
      syncFullHistory:       false,
      qrTimeout:             60_000,
      getMessage: async () => ({ conversation: "" }),
    });
    global.__sock = sock;

    sock.ev.on("creds.update", () => { saveCreds(); });

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;

      if (qr) {
        if (isPairingMode && pairingPhoneNumber && !sock.authState.creds.registered) {
          try {
            const code = await sock.requestPairingCode(pairingPhoneNumber);
            global.__BOT_STATE.pairingCode = code;
            global.__BOT_STATE.qr = null;
            global.__BOT_STATE.connection = "connecting";
            io.emit("pairingCode", { code, phoneNumber: pairingPhoneNumber });
            addLog("success", `📱 KÒD PAIRING: ${code}`);
            console.log(chalk.green.bold(`\n📱 KÒD: ${chalk.yellow.bold(code)}\n`));
          } catch(err) { addLog("error", `Pairing: ${err.message}`); }
        } else if (!isPairingMode) {
          QRCode.toDataURL(qr, (err, url) => {
            if (err) return;
            global.__BOT_STATE.qr = url; global.__BOT_STATE.connection = "qr";
            io.emit("qr", url);
            addLog("info", "📷 QR Code prè");
          });
        }
      }

      if (connection === "open") {
        reconnectAttempts = 0; isPairingMode = false; pairingPhoneNumber = null;
        global.__BOT_STATE.connection = "open";
        global.__BOT_STATE.qr = null; global.__BOT_STATE.pairingCode = null;
        global.__BOT_STATE.userJid = sock.user?.id || null;
        global.__BOT_STATE.userName = sock.user?.name || null;
        io.emit("connectionState", { state: "open", user: sock.user });
        addLog("success", `✅ KONEKTE! (${sock.user?.id})`);
        console.log(chalk.green.bold(`\n👻 GhostBot — ONLINE! (${sock.user?.id})\n`));
        try { loadCommands(); } catch(_) {}

        // ── Mete foto pwofil bot la (logo GhostBot) ────────
        setTimeout(async () => {
          try {
            const logoPath = path.join(__dirname, "src/assets/ghostbot.png");
            if (fs.existsSync(logoPath)) {
              const img = fs.readFileSync(logoPath);
              await sock.updateProfilePicture(sock.user.id, img);
              addLog("success", "🖼️ Foto pwofil bot la aktyalize ✅");
            }
          } catch(e) {
            addLog("warn", `Foto pwofil: ${e.message}`);
          }
        }, 5000);

        // Keep-alive ping chak 25s
        keepAliveTimer = setInterval(async () => {
          try { if (sock && global.__BOT_STATE.connection === "open") await sock.sendPresenceUpdate("available"); } catch(_) {}
        }, 25_000);

        setTimeout(async () => {
          try {
            const groups = await sock.groupFetchAllParticipating();
            const { getGroupSettings } = require("./src/lib/database");
            const list = Object.values(groups).map(g => ({
              id: g.id, subject: g.subject, size: g.participants?.length||0,
              botEnabled: getGroupSettings(g.id).botEnabled !== false,
              autoReact: getGroupSettings(g.id).autoReact === true,
            }));
            io.emit("groupsLoaded", { groups: list });
            addLog("info", `👥 ${list.length} gwoup chaje`);
          } catch(_) {}
        }, 3000);
      }

      if (isNewLogin) addLog("success", "🆕 Nouvo login");

      if (connection === "close") {
        if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
        const code   = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || "unknown";
        addLog("warn", `⬇️ Koneksyon kase | code=${code} | ${reason}`);

        const isLoggedOut     = code === DisconnectReason.loggedOut || code === 401;
        const isRestartNeeded = code === DisconnectReason.restartRequired || code === 515;
        const isForbidden     = code === 403;

        if (isLoggedOut || isForbidden) {
          addLog("error", "⚠️ SESYON EKSPIRE — efase epi redémarre");
          try { if(sock){try{sock.ev.removeAllListeners();}catch(_){} try{sock.end();}catch(_){}} } catch(_){}
          try { fs.removeSync(config.SESSION_DIR); fs.ensureDirSync(config.SESSION_DIR); } catch(_){}
          sock = null; global.__sock = null;
          global.__BOT_STATE.connection = "close"; global.__BOT_STATE.qr = null;
          isPairingMode = false; pairingPhoneNumber = null;
          io.emit("connectionState", { state: "close" });
          reconnectAttempts = 0; setTimeout(startBot, 3000);
        } else if (isRestartNeeded) {
          addLog("warn", "🔄 Restart nesesè"); reconnectAttempts = 0; setTimeout(startBot, 3000);
        } else if (isManualDisconnect) {
          isManualDisconnect = false;
          global.__BOT_STATE.connection = "close";
          io.emit("connectionState", { state: "close" });
        } else {
          reconnectAttempts++;
          const wait = Math.min(reconnectAttempts * 3, 15);
          addLog("info", `⏳ Rekoneksyon nan ${wait}s (#${reconnectAttempts})`);
          global.__BOT_STATE.connection = "connecting";
          io.emit("connectionState", { state: "connecting" });
          reconnectTimer = setTimeout(() => { reconnectTimer = null; startBot(); }, wait * 1000);
        }
      }

      if (connection === "connecting") {
        global.__BOT_STATE.connection = "connecting";
        io.emit("connectionState", { state: "connecting" });
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (!m.message) continue;
        global.__BOT_STATE.stats.messagesProcessed++;
        try { await messageHandler(sock, m); }
        catch(e) { global.__BOT_STATE.stats.errors++; addLog("error", `Handler: ${e.message}`); }
      }
      io.emit("stats", global.__BOT_STATE.stats);
    });

    sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
      try {
        const { getGroupSettings } = require("./src/lib/database");
        const meta = await sock.groupMetadata(id);
        const s    = getGroupSettings(id);
        if (action === "add" && s.welcome) {
          for (const jid of participants) {
            await sock.sendMessage(id, {
              text: `👻 *${config.BOT_NAME}*\n\n👋 Byenveni nan *${meta.subject}*!\n@${jid.split("@")[0]} 🎉\n\n_KING DEV WEB_`,
              mentions: [jid],
            });
          }
        }
        if (action === "remove" && s.goodbye) {
          for (const jid of participants) {
            await sock.sendMessage(id, {
              text: `😢 @${jid.split("@")[0]} te kite gwoup la. 💔`,
              mentions: [jid],
            });
          }
        }
      } catch(_) {}
    });

  } catch(e) {
    addLog("error", `💥 FATAL: ${e.message}`);
    console.error(e);
    if (e.message?.includes("bad-request") || e.message?.includes("invalid")) {
      try { fs.removeSync(config.SESSION_DIR); fs.ensureDirSync(config.SESSION_DIR); } catch(_){}
    }
    reconnectAttempts++;
    const wait = Math.min(reconnectAttempts * 3, 15);
    reconnectTimer = setTimeout(startBot, wait * 1000);
  }
}

// ═══════════════════════════════════════════════════════════════
// LAUNCH
// ═══════════════════════════════════════════════════════════════
server.listen(PORT, "0.0.0.0", () => {
  console.log(chalk.magenta.bold(`\n🌐 Dashboard: http://0.0.0.0:${PORT}`));
  console.log(chalk.cyan(`📧 Admin: ${ADMIN_EMAIL}`));
  console.log(chalk.magenta.bold(`📁 Session: ${config.SESSION_DIR}\n`));
  addLog("info", `Dashboard prè sou port ${PORT} | Admin: ${ADMIN_EMAIL}`);
});

startBot();
