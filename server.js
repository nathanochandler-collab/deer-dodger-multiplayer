const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function roomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "index.html" : req.url.slice(1);
  const filePath = path.join(__dirname, file);
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const ext = path.extname(filePath);
  const type = ext === ".html" ? "text/html" : "text/plain";
  res.writeHead(200, {"Content-Type": type});
  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({ server });

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

wss.on("connection", ws => {
  ws.room = null;
  ws.playerId = null;

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "create") {
      const code = roomCode();
      rooms.set(code, { players: new Set(), deer: [], started: false });
      join(ws, code);
      send(ws, { type: "roomCreated", room: code, playerId: ws.playerId, players: 1 });
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.room || "").toUpperCase();
      if (!rooms.has(code)) {
        send(ws, { type: "error", message: "Room not found." });
        return;
      }
      const room = rooms.get(code);
      if (room.players.size >= 2) {
        send(ws, { type: "error", message: "That room is full." });
        return;
      }
      join(ws, code);
      room.started = true;
      for (const p of room.players) {
        send(p, { type: "playerJoined", players: 2 });
      }
      return;
    }

    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;

    if (msg.type === "state") {
      for (const p of room.players) {
        if (p !== ws) {
          send(p, {
            type: "state",
            playerId: ws.playerId,
            x: msg.x,
            score: msg.score || 0,
            alive: msg.alive !== false,
            deer: room.deer,
            started: room.started
          });
        }
      }
    }

    if (msg.type === "dead") {
      for (const p of room.players) {
        send(p, { type: "gameOver", playerId: ws.playerId });
      }
    }
  });

  ws.on("close", () => {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;
    room.players.delete(ws);
    if (room.players.size === 0) rooms.delete(ws.room);
  });
});

function join(ws, code) {
  const room = rooms.get(code);
  ws.room = code;
  ws.playerId = Math.random().toString(36).substring(2, 10);
  room.players.add(ws);
}

server.listen(PORT, () => {
  console.log(`Deer Dodge running on port ${PORT}`);
});