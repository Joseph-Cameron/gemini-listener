# Lovense PoC — Full Technical Handoff

## Project Overview

A Proof of Concept for web-to-local hardware communication. A **Web Dispatcher** (Express + Socket.io server) receives natural-language events via HTTP POST, parses them into device commands, and broadcasts them over WebSocket to an authenticated **Local Windows Listener** (Socket.io client) which forwards commands to the **Lovense LAN API** running on localhost. A **Live Dashboard** connects to the same Socket.io server and displays all events in real time.

**Target environment:** Windows desktop running Lovense Connect app (exposes LAN API at `http://127.0.0.1:20010`).

---

## Architecture

```
                         ┌──────────────────────────────┐
  HTTP POST /trigger-ai  │     Web Dispatcher            │  Socket.io
  (from AI, webhook,  ──▶│     (server.js)               │◀── dashboard.html
   or curl)              │     Express + Socket.io       │    (read-only viewer)
                         │     Port 3000                 │
                         └──────────┬─────────────────────┘
                                    │ Socket.io (authenticated)
                                    │ event: "trigger_device"
                                    ▼
                         ┌──────────────────────────────┐
                         │     Local Listener            │
                         │     (listener.js)             │
                         │     Socket.io client          │
                         └──────────┬─────────────────────┘
                                    │ HTTP POST
                                    │ (e.g. /Vibrate, /Command)
                                    ▼
                         ┌──────────────────────────────┐
                         │     Lovense Connect App       │
                         │     LAN API                   │
                         │     http://127.0.0.1:20010    │
                         └──────────────────────────────┘
```

---

## File Structure

```
lovense-poc/
├── web-dispatcher/
│   ├── package.json
│   ├── server.js              # Express + Socket.io server + AI parser
│   └── public/
│       └── dashboard.html     # Real-time event viewer (single-file, no build step)
│
├── local-listener/
│   ├── package.json
│   ├── listener.js            # Socket.io client → Lovense LAN API bridge
│   └── received-media/        # Auto-created. Stores decoded base64 images.
│
└── AI_HANDOFF.md              # This file
```

---

## Dependencies

### web-dispatcher/package.json
```json
{
  "name": "lovense-web-dispatcher",
  "version": "1.0.0",
  "description": "PoC Web Dispatcher — Express + Socket.io server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.7.0"
  }
}
```

### local-listener/package.json
```json
{
  "name": "lovense-local-listener",
  "version": "1.0.0",
  "description": "PoC Local Listener — bridges Socket.io events to Lovense LAN API",
  "main": "listener.js",
  "scripts": {
    "start": "node listener.js"
  },
  "dependencies": {
    "socket.io-client": "^4.7.0"
  }
}
```

---

## Environment Variables

| Variable | Component | Default | Description |
|----------|-----------|---------|-------------|
| `PORT` | web-dispatcher | `3000` | HTTP + WebSocket listen port |
| `AUTH_TOKEN` | both | `change-me-in-production` | Shared secret for Socket.io handshake |
| `DISPATCHER_URL` | local-listener | `http://localhost:3000` | URL of the web dispatcher |
| `LOVENSE_API` | local-listener | `http://127.0.0.1:20010` | Lovense Connect LAN API base URL |
| `MEDIA_DIR` | local-listener | `./received-media` | Directory for saved base64 images |

---

## Complete Source Code

### web-dispatcher/server.js

```javascript
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
// Maps natural-language events to device commands.
// Replace this with a real LLM call (OpenAI, Claude, Gemini) later.
function parseEvent(eventText) {
  const text = eventText.toLowerCase();

  // Tip-based intensity mapping
  const tipMatch = text.match(/\$(\d+)\s*tip/);
  if (tipMatch) {
    const amount = parseInt(tipMatch[1], 10);
    // Scale: $1-5 = low, $6-15 = medium, $16+ = high
    const intensity = amount <= 5 ? 2 : amount <= 15 ? 8 : 15;
    return { command: "Vibrate", intensity, reason: `$${amount} tip` };
  }

  if (text.includes("subscribe") || text.includes("follow")) {
    return { command: "Vibrate", intensity: 3, reason: "new subscriber" };
  }

  if (text.includes("gift") || text.includes("donation")) {
    return { command: "Vibrate", intensity: 10, reason: "gift received" };
  }

  // Default
  return { command: "Vibrate", intensity: 1, reason: "unrecognized event" };
}

// --- AI trigger endpoint (rich payloads) ---
// Accepts: event (string, required), message (string), url (string), image (base64 string)
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

// --- Health check ---
app.get("/", (_req, res) => res.send("Web Dispatcher running."));

http.listen(PORT, () =>
  console.log(`[dispatcher] listening on http://localhost:${PORT}`)
);
```

### local-listener/listener.js

```javascript
const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// --- Config ---
const DISPATCHER_URL = process.env.DISPATCHER_URL || "http://localhost:3000";
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

  // Send command to Lovense hardware
  const lovenseUrl = `${LOVENSE_API}/${command}`;
  const body = JSON.stringify({ v: intensity, t: 0 });

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
  }

  console.log("─".repeat(50));
});

console.log(`[listener] connecting to ${DISPATCHER_URL} ...`);
```

### web-dispatcher/public/dashboard.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lovense PoC — Live Dashboard</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      min-height: 100vh;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: #1a1a1a;
      border-bottom: 1px solid #2a2a2a;
    }
    header h1 { font-size: 18px; font-weight: 600; }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #888;
    }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #555;
      transition: background 0.3s;
    }
    .status-dot.connected { background: #22c55e; }
    .stats {
      display: flex;
      gap: 24px;
      padding: 16px 24px;
      background: #141414;
      border-bottom: 1px solid #2a2a2a;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
    .stat-value { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .stat-value.intensity { color: #f59e0b; }
    .stat-value.count { color: #3b82f6; }
    #feed {
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: calc(100vh - 140px);
      overflow-y: auto;
    }
    .event-card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
      padding: 16px;
      animation: slideIn 0.3s ease-out;
      transition: border-color 0.3s;
    }
    .event-card.flash { border-color: #f59e0b; }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .event-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .event-reason {
      font-weight: 600;
      font-size: 15px;
      color: #fff;
    }
    .event-time {
      font-size: 12px;
      color: #666;
      font-variant-numeric: tabular-nums;
    }
    .intensity-bar-wrap {
      background: #2a2a2a;
      border-radius: 6px;
      height: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .intensity-bar {
      height: 100%;
      border-radius: 6px;
      transition: width 0.4s ease-out;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
    }
    .meta-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #222;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 12px;
      color: #aaa;
      max-width: 100%;
    }
    .meta-tag a { color: #60a5fa; text-decoration: none; word-break: break-all; }
    .meta-tag a:hover { text-decoration: underline; }
    .message-text {
      background: #222;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      color: #ccc;
      margin-top: 8px;
      line-height: 1.5;
    }
    .event-image {
      margin-top: 10px;
      max-width: 200px;
      max-height: 200px;
      border-radius: 8px;
      border: 1px solid #333;
    }
    .empty-state {
      text-align: center;
      padding: 80px 24px;
      color: #555;
    }
    .empty-state p { font-size: 14px; margin-top: 8px; }
    .empty-state .big { font-size: 40px; margin-bottom: 8px; }
  </style>
</head>
<body>

<header>
  <h1>Live Event Dashboard</h1>
  <div class="status">
    <div class="status-dot" id="statusDot"></div>
    <span id="statusText">Connecting...</span>
  </div>
</header>

<div class="stats">
  <div class="stat">
    <span class="stat-label">Events</span>
    <span class="stat-value count" id="eventCount">0</span>
  </div>
  <div class="stat">
    <span class="stat-label">Last Intensity</span>
    <span class="stat-value intensity" id="lastIntensity">—</span>
  </div>
  <div class="stat">
    <span class="stat-label">Last Command</span>
    <span class="stat-value" id="lastCommand">—</span>
  </div>
</div>

<div id="feed">
  <div class="empty-state" id="emptyState">
    <div class="big">&#x1f4e1;</div>
    <strong>Waiting for events...</strong>
    <p>Send a POST to /trigger-ai and it will appear here in real time.</p>
  </div>
</div>

<script>
  const socket = io({ auth: { token: "dashboard" } });
  const feed = document.getElementById("feed");
  const emptyState = document.getElementById("emptyState");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const eventCountEl = document.getElementById("eventCount");
  const lastIntensityEl = document.getElementById("lastIntensity");
  const lastCommandEl = document.getElementById("lastCommand");

  let eventCount = 0;
  const MAX_EVENTS = 50;

  socket.on("connect", () => {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
  });

  socket.on("disconnect", () => {
    statusDot.classList.remove("connected");
    statusText.textContent = "Disconnected";
  });

  function intensityColor(v) {
    if (v <= 4) return "#22c55e";
    if (v <= 9) return "#f59e0b";
    return "#ef4444";
  }

  function timeStr() {
    return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  socket.on("trigger_device", (payload) => {
    if (emptyState) emptyState.remove();
    const { command = "Vibrate", intensity = 1, message, url, image } = payload;

    eventCount++;
    eventCountEl.textContent = eventCount;
    lastIntensityEl.textContent = intensity + " / 20";
    lastCommandEl.textContent = command;

    const card = document.createElement("div");
    card.className = "event-card flash";
    setTimeout(() => card.classList.remove("flash"), 600);

    const pct = Math.min((intensity / 20) * 100, 100);
    const color = intensityColor(intensity);

    let html = `
      <div class="event-header">
        <span class="event-reason">${command} &mdash; Intensity ${intensity}</span>
        <span class="event-time">${timeStr()}</span>
      </div>
      <div class="intensity-bar-wrap">
        <div class="intensity-bar" style="width:${pct}%;background:${color}"></div>
      </div>
    `;

    if (message) {
      html += `<div class="message-text">${escHtml(message)}</div>`;
    }

    const metaTags = [];
    if (url) {
      metaTags.push(`<span class="meta-tag">&#x1f517; <a href="${escAttr(url)}" target="_blank" rel="noopener">${escHtml(url)}</a></span>`);
    }
    if (image?.data) {
      metaTags.push(`<span class="meta-tag">&#x1f5bc; Image attached</span>`);
    }
    if (metaTags.length) {
      html += `<div class="meta-row">${metaTags.join("")}</div>`;
    }

    if (image?.data) {
      html += `<img class="event-image" src="data:image/png;base64,${escAttr(image.data)}" alt="attached image">`;
    }

    card.innerHTML = html;
    feed.prepend(card);

    while (feed.children.length > MAX_EVENTS) {
      feed.removeChild(feed.lastChild);
    }
  });

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  function escAttr(s) {
    return s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
</script>

</body>
</html>
```

---

## API Reference

### POST /trigger-ai

The single inbound endpoint. Accepts a natural-language event and optional rich content.

**Request body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | Yes | Natural-language event description (parsed by AI function) |
| `message` | string | No | Pass-through text displayed on dashboard and logged by listener |
| `url` | string | No | Pass-through URL displayed as clickable link on dashboard |
| `image` | string | No | Base64-encoded image data. Displayed on dashboard, saved to disk by listener. |

**Response (JSON):**

```json
{
  "status": "dispatched",
  "parsed": {
    "command": "Vibrate",
    "intensity": 8,
    "reason": "$10 tip"
  },
  "hasMessage": true,
  "hasUrl": true,
  "hasImage": false
}
```

**Current parseEvent rules (mock AI — replace with LLM call):**

| Input pattern | Command | Intensity | Reason |
|---------------|---------|-----------|--------|
| `$1–$5 tip` | Vibrate | 2 | `$N tip` |
| `$6–$15 tip` | Vibrate | 8 | `$N tip` |
| `$16+ tip` | Vibrate | 15 | `$N tip` |
| contains "subscribe" or "follow" | Vibrate | 3 | `new subscriber` |
| contains "gift" or "donation" | Vibrate | 10 | `gift received` |
| anything else | Vibrate | 1 | `unrecognized event` |

### Socket.io Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `trigger_device` | server → clients | `{ command, intensity, message, url, image }` | Broadcast to all authenticated listeners and dashboard viewers |

### Socket.io Authentication

Clients pass a token during the handshake via `auth: { token }`. The server accepts two token types:

| Token value | Role | Purpose |
|-------------|------|---------|
| Matches `AUTH_TOKEN` env var | `listener` | Full access — receives events and forwards to Lovense API |
| `"dashboard"` | `dashboard` | Read-only — receives events for display only |
| Anything else | Rejected | Connection refused with `AUTH_FAILED` error |

---

## Lovense LAN API Integration

The listener sends HTTP POST requests to the Lovense Connect app's local API.

**Base URL:** `http://127.0.0.1:20010` (default; configurable via `LOVENSE_API` env var)

**Endpoints used:**

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/Vibrate` | POST | `{ "v": <0-20>, "t": 0 }` | Set vibration intensity. `v` = intensity (0 = stop, 20 = max). `t` = toy index (0 = all). |
| `/GetToys` | GET | — | Returns connected toy list (not yet implemented in PoC) |
| `/Command` | POST | `{ "command": "...", ... }` | Generic command endpoint (for future use) |

**Prerequisites:** Lovense Connect desktop app must be running on the same machine with at least one toy paired and connected.

---

## Running the PoC

### Quick Start (localhost testing)

**Terminal 1 — Dispatcher:**
```bash
cd lovense-poc/web-dispatcher
npm install
npm start
```

**Terminal 2 — Listener:**
```bash
cd lovense-poc/local-listener
npm install
npm start
```

**Terminal 3 — Test:**
```bash
curl -X POST http://localhost:3000/trigger-ai -H "Content-Type: application/json" -d "{\"event\": \"User received a $10 tip\", \"message\": \"Great stream!\", \"url\": \"https://example.com/fan/99\"}"
```

**Dashboard:** Open `http://localhost:3000/dashboard.html` in a browser.

**PowerShell alternative (no curl):**
```powershell
Invoke-RestMethod -Uri http://localhost:3000/trigger-ai -Method Post -ContentType "application/json" -Body '{"event":"User received a $10 tip","message":"Great stream!"}'
```

### With real auth token

```bash
# Terminal 1
AUTH_TOKEN=my-secret-key npm start

# Terminal 2
AUTH_TOKEN=my-secret-key npm start
```

### Test auth rejection

```bash
AUTH_TOKEN=wrong-token node listener.js
# Expected: [listener] authentication failed — check AUTH_TOKEN
```

---

## Known Limitations and Next Steps

1. **Mock AI parser** — The `parseEvent()` function uses regex/keyword matching. Replace with a real LLM call (OpenAI, Claude API, or Gemini) for natural-language understanding.
2. **No HTTPS** — PoC runs over plain HTTP on localhost. Add TLS if deploying the dispatcher to a remote server.
3. **Dashboard auth is hardcoded** — The dashboard uses a fixed `"dashboard"` token. Add a proper viewer auth flow for production.
4. **No /GetToys integration** — The listener doesn't query connected toys before sending commands. Add a startup check that calls `/GetToys` and caches the toy list.
5. **No command queuing** — Events are fire-and-forget. Add a queue with retry logic for missed Lovense API calls.
6. **Single Lovense command** — Only `Vibrate` is implemented. The Lovense LAN API also supports `Rotate`, `AirAuto`, `Preset`, etc.
7. **No rate limiting** — The `/trigger-ai` endpoint has no throttle. Add express-rate-limit for production.
8. **CORS is wide open** — `cors: { origin: "*" }` on Socket.io. Lock down to specific origins in production.
9. **Image storage grows unbounded** — The `received-media/` directory has no cleanup. Add rotation or size limits.

---

## Tested and Verified

All components were tested end-to-end in a sandboxed Linux environment on 2026-04-12:

- Dispatcher starts and listens on port 3000
- Listener authenticates via Socket.io handshake and connects
- Auth rejection works for bad tokens
- `/trigger-ai` parses all event types correctly ($N tips at all tiers, subscribe, gift, unrecognized)
- Rich payloads (message, url, image) pass through to listener and dashboard
- Base64 images decode and save to disk
- Dashboard receives and renders events in real time via Socket.io
