# Deer Dodge Multiplayer

This is the multiplayer version of the Deer Dodge HTML game.

## Run locally

1. Install Node.js.
2. Open a terminal in this folder.
3. Run:
   npm install
4. Then:
   npm start
5. Open http://localhost:3000 in two browser tabs.
6. Create a room in one tab and enter the room code in the other.

## Important

This version needs a server because real-time multiplayer requires WebSockets. A static-only host such as a normal Neocities page cannot run `server.js`.

For an online version, deploy this folder to a Node-compatible host that supports WebSockets.
