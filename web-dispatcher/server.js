const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const http = createServer(app);
const pathMod = require("path");

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || "change-me-in-production";

// Serve dashboard UI
app.use(express.static(pathMod.join(__dirname, "public")));

// --- Socket.io with token auth middleware ---
const io = new Server(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for image payloads
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  // Allow dashboard viewers (read-only) and authenticated listeners
  if (token === "dashboard" || token === AUTH_TOKEN) {
    const role = token === AUTH_TOKEN ? "listener" : "dashboard";
    socket.data.role = role;
    console.log(`[auth] ${role} connected: ${socket.id}`);
    return next();
  }
  console.warn(`[auth] rejected connection — bad token`);
  return next(new Error("AUTH_FAILED"));
});

io.on("connection", (socket) => {
  console.log(`[ws] listener connected: ${socket.id}`);
  socket.on("disconnect", () =>
    console.log(`[ws] listener disconnected: ${socket.id}`)
  );
});

// --- Mock AI parser ---
function parseEvent(eventText) {
  const text = eventText.toLowerCase();

  const tipMatch = text.match(/\$(\d+)\s*tip/);
  if (tipMatch) {
    const amount = parseInt(tipMatch[1], 10);
    const intensity = amount <= 5 ? 2 : amount <= 15 ? 8 : 15;
    return { command: "Vibrate", intensity, reason: `$${amount} tip` };
  }

  if (text.includes("subscribe") || text.includes("follow")) {
    return { command: "Vibrate", intensity: 3, reason: "new subscriber" };
  }

  if (text.includes("gift") || text.includes("donation")) {
    return { command: "Vibrate", intensity: 10, reason: "gift received" };
  }

  return { command: "Vibrate", intensity: 1, reason: "unrecognized event" };
}

// --- AI trigger endpoint (rich payloads) ---
// Accepts: event (string), message (string), url (string), image (base64 string)
app.post("/trigger-ai", express.json({ limit: "10mb" }), (req, res) => {
  const { event, message, url, image } = req.body;

  if (!event) {
    return res.status(400).json({ error: "Missing 'event' field" });
  }

  const parsed = parseEvent(event);
  console.log(`[ai] "${event}" → ${parsed.reason} (intensity ${parsed.intensity})`);

  // Build rich payload for the listener
  const payload = {
    command: parsed.command,
    intensity: parsed.intensity,
    // Pass-through fields — the listener forwards these to the UI or logs them
    message: message || null,
    url: url || null,
    image: image ? { data: image, size: image.length } : null,
  };

  if (message) console.log(`[ai]   message: "${message}"`);
  if (url) console.log(`[ai]   url: ${url}`);
  if (image) console.log(`[ai]   image: ${(image.length / 1024).toFixed(1)} KB base64`);

  io.emit("trigger_device", payload);
  res.json({ status: "dispatched", parsed, hasMessage: !!message, hasUrl: !!url, hasImage: !!image });
});

// --- Lovense Developer API Config ---
const LOVENSE_DEV_TOKEN = process.env.LOVENSE_DEV_TOKEN || "G1HMJLCrRzgovcmH-wpKG9cFpczL8x8o9ge2ggWW_ghnNC2JZI3QaihruVIsvw_a";
let lovenseConnection = null; // Stores toy connection info from callback

// --- Lovense callback endpoint ---
// Lovense cloud sends toy connection data here after QR/code pairing
app.post("/lovense-callback", express.json(), (req, res) => {
  console.log("[lovense-callback] Received:", JSON.stringify(req.body, null, 2));
  lovenseConnection = req.body;
  io.emit("lovense_connected", req.body);
  res.json({ status: "ok" });
});

// --- Get QR code / 6-char code for Lovense pairing ---
app.get("/lovense-pair", async (_req, res) => {
  try {
    const response = await fetch("https://api.lovense.com/api/lan/getQrCode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: LOVENSE_DEV_TOKEN,
        uid: "joey1",
        uname: "Joey",
        utoken: "poc-token-joey",
        v: 2,
      }),
    });
    const data = await response.json();
    console.log("[lovense-pair] QR code response:", JSON.stringify(data, null, 2));
    res.json(data);
  } catch (err) {
    console.error("[lovense-pair] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Check current Lovense connection status ---
app.get("/lovense-status", (_req, res) => {
  res.json({ connected: !!lovenseConnection, connection: lovenseConnection });
});

// --- Health check ---
app.get("/", (_req, res) => res.send("Web Dispatcher running."));

http.listen(PORT, "0.0.0.0", () =>
  console.log(`[dispatcher] listening on http://0.0.0.0:${PORT} (all interfaces)`)
);
