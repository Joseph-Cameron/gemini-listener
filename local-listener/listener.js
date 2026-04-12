const { io } = require("socket.io-client");
const https = require("https");
const fs = require("fs");
const path = require("path");

// Allow self-signed certs for Lovense's localhost HTTPS domain
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// --- Config ---
const DISPATCHER_URL = process.env.DISPATCHER_URL || "http://127.0.0.1:3000";
// Lovense Connect PC uses HTTPS on port 30010 via special domain
// Mobile app uses HTTP on port 20010 — uncomment below if using phone instead
const LOVENSE_API = process.env.LOVENSE_API || "http://127.0.0.1:20010";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "change-me-in-production";
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), "received-media");

// Create media directory for saved images
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- Connect with token auth ---
const socket = io(DISPATCHER_URL, {
  auth: { token: AUTH_TOKEN },
});

socket.on("connect", () =>
  console.log(`[listener] authenticated & connected (${socket.id})`)
);

socket.on("connect_error", (err) => {
  if (err.message === "AUTH_FAILED") {
    console.error("[listener] authentication failed — check AUTH_TOKEN");
  } else {
    console.error("[listener] connection error:", err.message);
  }
});

socket.on("disconnect", () =>
  console.log("[listener] disconnected from dispatcher")
);

// --- Handle rich device trigger ---
socket.on("trigger_device", async (payload) => {
  const { command = "Vibrate", intensity = 1, message, url, image } = payload;

  console.log("─".repeat(50));
  console.log(`[trigger] ${command} @ intensity ${intensity}`);

  // Display message if present
  if (message) {
    console.log(`[message] ${message}`);
  }

  // Display URL if present
  if (url) {
    console.log(`[url] ${url}`);
  }

  // Save image if present
  if (image?.data) {
    const timestamp = Date.now();
    const filename = `image-${timestamp}.png`;
    const filepath = path.join(MEDIA_DIR, filename);
    try {
      const buffer = Buffer.from(image.data, "base64");
      fs.writeFileSync(filepath, buffer);
      console.log(`[image] saved to ${filepath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`[image] failed to save:`, err.message);
    }
  }

  // Send command to Lovense hardware via /command endpoint
  const lovenseUrl = `${LOVENSE_API}/command`;
  const body = JSON.stringify({
    command: "Function",
    action: `Vibrate:${intensity}`,
    timeSec: 0,
    apiVer: 1,
  });

  try {
    const res = await fetch(lovenseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();
    console.log(`[lovense] ${command} response:`, data);
  } catch (err) {
    console.error(`[lovense] ${command} failed:`, err.message);
    console.log("[lovense] (Is Lovense Connect running and a toy connected?)");
    console.log("[lovense] Make sure Lovense Connect desktop app is open with a toy paired.");
  }

  console.log("─".repeat(50));
});

console.log(`[listener] connecting to ${DISPATCHER_URL} ...`);
console.log(`[listener] Lovense API target: ${LOVENSE_API}`);

// Startup: test Lovense connection
(async () => {
  try {
    const testUrl = `${LOVENSE_API}/command`;
    const res = await fetch(testUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "GetToys", apiVer: 1 }),
    });
    const data = await res.json();
    console.log("[lovense] Connection OK! Toys:", JSON.stringify(data));
  } catch (err) {
    console.error(`[lovense] Cannot reach Lovense Connect: ${err.message}`);
    console.log("[lovense] Trying alternative port 20010 (HTTP)...");
    try {
      const res2 = await fetch("http://127.0.0.1:20010/GetToys", {
        method: "GET",
      });
      const data2 = await res2.json();
      console.log("[lovense] Found on port 20010! Toys:", JSON.stringify(data2));
      console.log("[lovense] TIP: Restart listener with LOVENSE_API=http://127.0.0.1:20010");
    } catch (err2) {
      console.error("[lovense] Port 20010 also failed:", err2.message);
      console.log("[lovense] Make sure Lovense Connect desktop app is running with a toy paired.");
    }
  }
})();
