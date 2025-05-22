const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server);
const chess = new Chess();
let players = {};
let playerNames = {};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", { title: "Chess Game" });
});

function emitPlayerStatus() {
  io.emit("playerStatus", {
    white: players.white
      ? { connected: true, name: playerNames[players.white] || null }
      : { connected: false, name: null },
    black: players.black
      ? { connected: true, name: playerNames[players.black] || null }
      : { connected: false, name: null },
  });
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  if (!players.white) {
    players.white = socket.id;
    socket.emit("playerRole", "w");
  } else if (!players.black) {
    players.black = socket.id;
    socket.emit("playerRole", "b");
  } else {
    socket.emit("spectatorRole");
  }

  socket.on("setName", (name) => {
    playerNames[socket.id] = name;
    emitPlayerStatus();
  });

  socket.emit("boardState", chess.fen());
  emitPlayerStatus();

  socket.on("disconnect", () => {
    if (socket.id === players.white) delete players.white;
    if (socket.id === players.black) delete players.black;
    delete playerNames[socket.id];
    emitPlayerStatus();
    console.log("Disconnected:", socket.id);
  });

  // Handle moves
  socket.on("move", (move) => {
    try {
      const isWhitePlayer = chess.turn() === "w" && socket.id === players.white;
      const isBlackPlayer = chess.turn() === "b" && socket.id === players.black;

      if (!isWhitePlayer && !isBlackPlayer) {
        socket.emit("invalidMove", "Not your turn!");
        return;
      }

      const result = chess.move(move);
      if (result) {
        io.emit("move", move);
        io.emit("boardState", chess.fen());
      } else {
        socket.emit("invalidMove", "Illegal move");
      }
    } catch (err) {
      console.error("Move error:", err);
      socket.emit("invalidMove", "Invalid move format");
    }
  });

  socket.on("newGame", () => {
    chess.reset();
    io.emit("boardState", chess.fen());
  });

  socket.on("undoMove", () => {
    chess.undo();
    io.emit("boardState", chess.fen());
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
