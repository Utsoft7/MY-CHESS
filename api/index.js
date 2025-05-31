const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server, {
  transports: ["polling"],
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const chess = new Chess();
let players = {};
let playerNames = {};

let whiteCapturedPieces = [];
let blackCapturedPieces = [];

const pieceDisplayMap = {
  p: { symbol: "♟", color: "black" },
  r: { symbol: "♜", color: "black" },
  n: { symbol: "♞", color: "black" },
  b: { symbol: "♝", color: "black" },
  q: { symbol: "♛", color: "black" },
  k: { symbol: "♚", color: "black" },
  P: { symbol: "♙", color: "white" },
  R: { symbol: "♖", color: "white" },
  N: { symbol: "♘", color: "white" },
  B: { symbol: "♗", color: "white" },
  Q: { symbol: "♕", color: "white" },
  K: { symbol: "♔", color: "white" },
};

// EJS Configuration - adjusted paths for Vercel
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Static files - serves your public folder (including public/js/chessgame.js)
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.render("index");
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

function emitTurnStatus() {
  const currentTurn = chess.turn();
  const turnInfo = {
    turn: currentTurn,
    player: currentTurn === "w" ? "white" : "black",
    playerName:
      currentTurn === "w"
        ? playerNames[players.white] || null
        : playerNames[players.black] || null,
  };
  io.emit("turnStatus", turnInfo);
}

function emitGameState() {
  io.emit("boardState", chess.fen());
  io.emit("capturedPieces", {
    white: whiteCapturedPieces,
    black: blackCapturedPieces,
  });

  emitTurnStatus();

  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    io.emit("gameOver", { winner: winner, reason: "checkmate" });
  } else if (chess.isStalemate()) {
    io.emit("gameOver", { winner: null, reason: "stalemate" });
  } else if (chess.isDraw()) {
    io.emit("gameOver", { winner: null, reason: "draw" });
  } else if (chess.inCheck()) {
    io.emit("inCheck", chess.turn());
  }
}

function handleCapturedPiece(move) {
  if (move.captured) {
    const capturedPieceInfo = pieceDisplayMap[move.captured];
    if (capturedPieceInfo) {
      if (move.color === "w") {
        whiteCapturedPieces.push(capturedPieceInfo);
      } else {
        blackCapturedPieces.push(capturedPieceInfo);
      }
    }
  }
}

function removeCapturedPiece(move) {
  if (move.captured) {
    const capturedPieceSymbol = move.captured;
    const pieceInfo = pieceDisplayMap[capturedPieceSymbol];

    if (pieceInfo) {
      if (move.color === "w") {
        const index = whiteCapturedPieces.findIndex(
          (p) => p.symbol === pieceInfo.symbol && p.color === pieceInfo.color
        );
        if (index !== -1) {
          whiteCapturedPieces.splice(index, 1);
        }
      } else {
        const index = blackCapturedPieces.findIndex(
          (p) => p.symbol === pieceInfo.symbol && p.color === pieceInfo.color
        );
        if (index !== -1) {
          blackCapturedPieces.splice(index, 1);
        }
      }
    }
  }
}

function isValidPlayerTurn(socket) {
  const isWhitePlayer = chess.turn() === "w" && socket.id === players.white;
  const isBlackPlayer = chess.turn() === "b" && socket.id === players.black;
  return isWhitePlayer || isBlackPlayer;
}

function resetGame() {
  chess.reset();
  whiteCapturedPieces = [];
  blackCapturedPieces = [];
}

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  if (!players.white) {
    players.white = socket.id;
    socket.emit("playerRole", "w");
    console.log(`Player assigned as White: ${socket.id}`);
  } else if (!players.black) {
    players.black = socket.id;
    socket.emit("playerRole", "b");
    console.log(`Player assigned as Black: ${socket.id}`);
  } else {
    socket.emit("spectatorRole");
    console.log(`User joined as spectator: ${socket.id}`);
  }

  emitGameState();
  emitPlayerStatus();

  socket.on("setName", (name) => {
    if (name && name.trim()) {
      playerNames[socket.id] = name.trim();
      console.log(`Player ${socket.id} set name: ${name.trim()}`);
      emitPlayerStatus();
      emitTurnStatus();
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    if (socket.id === players.white) {
      delete players.white;
      console.log("White player Got disconnected");
    }
    if (socket.id === players.black) {
      delete players.black;
      console.log("Black player Got disconnected");
    }

    delete playerNames[socket.id];
    emitPlayerStatus();
    emitTurnStatus();
  });

  socket.on("move", (move) => {
    try {
      if (!isValidPlayerTurn(socket)) {
        socket.emit("invalidMove", "Not your turn!");
        return;
      }

      const result = chess.move(move);

      if (result) {
        console.log(`Move made: ${result.san} by ${socket.id}`);

        handleCapturedPiece(result);

        io.emit("move", {
          from: result.from,
          to: result.to,
          san: result.san,
        });

        emitGameState();
      } else {
        socket.emit("invalidMove", "Illegal move");
      }
    } catch (err) {
      console.error("Move error:", err);
      socket.emit("invalidMove", "Invalid move format or server error.");
    }
  });

  socket.on("newGame", () => {
    if (socket.id === players.white || socket.id === players.black) {
      console.log(`New game started by ${socket.id}`);
      resetGame();
      emitGameState();
      io.emit("gameReset");
    } else {
      socket.emit("invalidAction", "Only players can start a new game");
    }
  });

  socket.on("undoMove", () => {
    if (!isValidPlayerTurn(socket)) {
      socket.emit("invalidAction", "You can only undo on your turn");
      return;
    }
  });

  socket.on("requestGameState", () => {
    // Send current game state to requesting client
    socket.emit("boardState", chess.fen());
    socket.emit("capturedPieces", {
      white: whiteCapturedPieces,
      black: blackCapturedPieces,
    });
    emitPlayerStatus();
    emitTurnStatus();
  });
});

module.exports = app;
