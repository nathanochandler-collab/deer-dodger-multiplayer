const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();


// ================================
// HELPER FUNCTIONS
// ================================

function makeRoomCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}


function send(ws, data) {
    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}


function broadcast(room, data) {
    for (const player of room.players.values()) {
        send(player.ws, data);
    }
}


// ================================
// REMOVE PLAYER
// ================================

function removePlayer(ws) {

    if (!ws.roomCode) {
        return;
    }

    const room =
        rooms.get(ws.roomCode);

    if (!room) {
        ws.roomCode = null;
        return;
    }

    room.players.delete(
        ws.playerId
    );

    console.log(
        `Player ${ws.playerId} left room ${ws.roomCode}.`
    );

    // Tell the remaining player
    // that the other player left.
    for (
        const player
        of room.players.values()
    ) {

        send(player.ws, {
            type: "playerLeft"
        });

    }

    // Delete empty rooms.
    if (room.players.size === 0) {

        rooms.delete(
            ws.roomCode
        );

        console.log(
            `Room ${ws.roomCode} deleted.`
        );
    }

    ws.roomCode = null;
    ws.playerId = null;
}


// ================================
// WEB SERVER
// ================================

const server =
    http.createServer(
        (req, res) => {

            let requested =
                req.url.split("?")[0];

            // Main page
            if (requested === "/") {
                requested = "/index.html";
            }

            const filePath =
                path.join(
                    __dirname,
                    requested
                );


            // Security check
            if (
                !filePath.startsWith(
                    __dirname
                )
            ) {

                res.writeHead(403);

                return res.end(
                    "Forbidden"
                );
            }


            // File doesn't exist
            if (
                !fs.existsSync(
                    filePath
                )
            ) {

                res.writeHead(404);

                return res.end(
                    "Not found"
                );
            }


            let contentType =
                "text/plain";


            if (
                filePath.endsWith(
                    ".html"
                )
            ) {

                contentType =
                    "text/html; charset=utf-8";

            } else if (
                filePath.endsWith(
                    ".css"
                )
            ) {

                contentType =
                    "text/css";

            } else if (
                filePath.endsWith(
                    ".js"
                )
            ) {

                contentType =
                    "text/javascript";
            }


            res.writeHead(
                200,
                {
                    "Content-Type":
                        contentType
                }
            );


            fs.createReadStream(
                filePath
            ).pipe(res);
        }
    );


// ================================
// WEBSOCKET SERVER
// ================================

const wss =
    new WebSocket.Server({
        server: server
    });


wss.on(
    "connection",
    (ws) => {

        ws.roomCode = null;
        ws.playerId = null;

        console.log(
            "New player connected."
        );


        ws.on(
            "message",
            (raw) => {

                let msg;

                try {

                    msg =
                        JSON.parse(
                            raw.toString()
                        );

                } catch {

                    send(ws, {
                        type: "error",
                        message:
                            "Invalid message."
                    });

                    return;
                }


                // ============================
                // CREATE ROOM
                // ============================

                if (
                    msg.type === "create"
                ) {

                    // Remove this connection
                    // from any old room first.
                    removePlayer(ws);


                    const code =
                        makeRoomCode();


                    const room = {

                        players:
                            new Map(),

                        deer: [],

                        started: false,

                        spawnTimer: 0,

                        roadSpeed: 5

                    };


                    rooms.set(
                        code,
                        room
                    );


                    ws.playerId =
                        Math.random()
                            .toString(36)
                            .substring(
                                2,
                                10
                            );


                    ws.roomCode =
                        code;


                    room.players.set(
                        ws.playerId,
                        {

                            ws: ws,

                            x: 228,

                            score: 0,

                            alive: true

                        }
                    );


                    console.log(
                        `Room ${code} created.`
                    );


                    send(ws, {

                        type:
                            "roomCreated",

                        room:
                            code,

                        playerId:
                            ws.playerId,

                        players:
                            1

                    });


                    return;
                }


                // ============================
                // JOIN ROOM
                // ============================

                if (
                    msg.type === "join"
                ) {

                    const code =
                        String(
                            msg.room || ""
                        )
                        .trim()
                        .toUpperCase();


                    console.log(
                        `Join request: ${code}`
                    );


                    if (!code) {

                        send(ws, {

                            type:
                                "error",

                            message:
                                "Enter a room code."

                        });

                        return;
                    }


                    const room =
                        rooms.get(
                            code
                        );


                    if (!room) {

                        send(ws, {

                            type:
                                "error",

                            message:
                                "Room not found."

                        });

                        return;
                    }


                    // Only TWO players
                    // are allowed.
                    if (
                        room.players.size >= 2
                    ) {

                        send(ws, {

                            type:
                                "error",

                            message:
                                "That room is full."

                        });

                        console.log(
                            `Room ${code} is full.`
                        );

                        return;
                    }


                    // Remove the connection
                    // from any old room.
                    removePlayer(ws);


                    ws.playerId =
                        Math.random()
                            .toString(36)
                            .substring(
                                2,
                                10
                            );


                    ws.roomCode =
                        code;


                    room.players.set(
                        ws.playerId,
                        {

                            ws: ws,

                            x: 228,

                            score: 0,

                            alive: true

                        }
                    );


                    // Two players = game starts.
                    if (
                        room.players.size === 2
                    ) {

                        room.started =
                            true;

                    }


                    console.log(
                        `Player joined ${code}. Players: ${room.players.size}/2`
                    );


                    send(ws, {

                        type:
                            "joined",

                        room:
                            code,

                        playerId:
                            ws.playerId,

                        players:
                            room.players.size

                    });


                    // Tell everyone in the room
                    // that another player joined.
                    broadcast(
                        room,
                        {

                            type:
                                "playerJoined",

                            players:
                                room.players.size

                        }
                    );


                    return;
                }


                // ============================
                // PLAYER POSITION
                // ============================

                if (
                    msg.type === "position"
                ) {

                    if (!ws.roomCode) {
                        return;
                    }


                    const room =
                        rooms.get(
                            ws.roomCode
                        );


                    if (!room) {
                        return;
                    }


                    const player =
                        room.players.get(
                            ws.playerId
                        );


                    if (!player) {
                        return;
                    }


                    const x =
                        Number(
                            msg.x
                        );


                    if (
                        Number.isFinite(
                            x
                        )
                    ) {

                        player.x =
                            Math.max(
                                95,
                                Math.min(
                                    361,
                                    x
                                )
                            );
                    }


                    player.alive =
                        msg.alive !== false;


                    return;
                }


                // ============================
                // PLAYER DIED
                // ============================

                if (
                    msg.type === "dead"
                ) {

                    if (!ws.roomCode) {
                        return;
                    }


                    const room =
                        rooms.get(
                            ws.roomCode
                        );


                    if (!room) {
                        return;
                    }


                    const player =
                        room.players.get(
                            ws.playerId
                        );


                    if (!player) {
                        return;
                    }


                    player.alive =
                        false;


                    broadcast(
                        room,
                        {

                            type:
                                "gameOver",

                            playerId:
                                ws.playerId

                        }
                    );


                    return;
                }

            }
        );


        // ============================
        // DISCONNECT
        // ============================

        ws.on(
            "close",
            () => {

                console.log(
                    "Player disconnected."
                );

                removePlayer(ws);

            }
        );


        ws.on(
            "error",
            () => {

                removePlayer(ws);

            }
        );

    }
);


// ================================
// SERVER-CONTROLLED GAME
// ================================

setInterval(
    () => {

        for (
            const [code, room]
            of rooms
        ) {

            // Don't run the game
            // until exactly two players
            // are connected.
            if (
                !room.started ||
                room.players.size !== 2
            ) {

                continue;
            }


            // ============================
            // SPAWN DEER
            // ============================

            room.spawnTimer--;


            if (
                room.spawnTimer <= 0
            ) {

                const lanes = [
                    125,
                    180,
                    235,
                    290,
                    345
                ];


                const lane =
                    lanes[
                        Math.floor(
                            Math.random() *
                            lanes.length
                        )
                    ];


                room.deer.push({

                    x:
                        lane,

                    y:
                        -60,

                    width:
                        50,

                    height:
                        40

                });


                room.spawnTimer =
                    60;

            }


            // ============================
            // MOVE DEER
            // ============================

            for (
                let i =
                    room.deer.length - 1;

                i >= 0;

                i--
            ) {

                room.deer[i].y +=
                    room.roadSpeed;


                // Deer reached bottom.
                if (
                    room.deer[i].y > 880
                ) {

                    room.deer.splice(
                        i,
                        1
                    );


                    // Give both players
                    // points.
                    for (
                        const player
                        of room.players.values()
                    ) {

                        player.score +=
                            10;

                    }

                }

            }


            // ============================
            // SEND GAME STATE
            // ============================

            const players =
                Array.from(
                    room.players.values()
                );


            for (
                const player
                of players
            ) {

                const other =
                    players.find(
                        p =>
                            p.ws !==
                            player.ws
                    );


                // Send opponent data.
                send(
                    player.ws,
                    {

                        type:
                            "state",

                        playerId:
                            other
                                ? other.ws.playerId
                                : null,

                        x:
                            other
                                ? other.x
                                : 228,

                        score:
                            other
                                ? other.score
                                : 0,

                        alive:
                            other
                                ? other.alive
                                : true,

                        deer:
                            room.deer,

                        gameStarted:
                            true

                    }
                );


                // Send this player's score.
                send(
                    player.ws,
                    {

                        type:
                            "selfScore",

                        score:
                            player.score

                    }
                );

            }

        }

    },

    50
);


// ================================
// START SERVER
// ================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Deer Dodge server running on port ${PORT}`
        );

    }
);
