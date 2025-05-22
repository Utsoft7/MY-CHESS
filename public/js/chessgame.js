const socket = io();
const chess = new Chess();
const boardElement = document.getElementById("chessboard");
const gameStatusElement = document.getElementById("game-status");
const moveHistoryElement = document.getElementById("move-history");

// Player status elements
const player1Element = document.getElementById("player1");
const player2Element = document.getElementById("player2");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let moveHistory = [];
let lastMoveSquares = [];

const UNICODE_PIECES = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
};

// Initialize game
const initializeGame = () => {
  renderBoard();
  updateGameStatus();
  updateMoveHistory();
};

// Piece rendering utilities
const getPieceUnicode = (piece) =>
  UNICODE_PIECES[piece.color === "w" ? piece.type.toUpperCase() : piece.type];
const isDraggable = (piece) => playerRole && piece.color === playerRole;

// Board rendering
const renderBoard = () => {
  boardElement.innerHTML = "";
  boardElement.classList.toggle("flipped", playerRole === "b");
  const board = chess.board();

  (playerRole === "b" ? [...board].reverse() : board).forEach(
    (row, rowIndex) => {
      row.forEach((square, colIndex) => {
        const [displayRow, displayCol] = calculateDisplayPosition(
          rowIndex,
          colIndex
        );
        createSquareElement(displayRow, displayCol, square);
      });
    }
  );

  highlightLastMove();
  highlightCheck();
};

const calculateDisplayPosition = (rowIndex, colIndex) => {
  if (playerRole === "b") {
    return [7 - rowIndex, 7 - colIndex];
  }
  return [rowIndex, colIndex];
};

const createSquareElement = (row, col, piece) => {
  const squareElement = document.createElement("div");
  squareElement.className = `square ${
    (row + col) % 2 === 0 ? "light" : "dark"
  }`;
  squareElement.dataset.position = `${String.fromCharCode(97 + col)}${8 - row}`;

  if (piece) {
    const pieceElement = document.createElement("div");
    pieceElement.className = `piece ${piece.color}${
      isDraggable(piece) ? " draggable" : ""
    }`;
    pieceElement.textContent = getPieceUnicode(piece);
    pieceElement.draggable = isDraggable(piece);

    pieceElement.addEventListener("dragstart", handleDragStart);
    pieceElement.addEventListener("dragend", handleDragEnd);

    squareElement.appendChild(pieceElement);
  }

  squareElement.addEventListener("dragover", handleDragOver);
  squareElement.addEventListener("drop", handleDrop);
  boardElement.appendChild(squareElement);
};

// Drag and drop handlers
const handleDragStart = (e) => {
  if (!e.target.draggable) return;
  draggedPiece = e.target;
  sourceSquare = draggedPiece.parentElement.dataset.position;
  setTimeout(() => (e.target.style.opacity = 0.5), 0);
};

const handleDragEnd = (e) => {
  e.target.style.opacity = "1";
  draggedPiece = null;
  sourceSquare = null;
};

const handleDragOver = (e) => e.preventDefault();

const handleDrop = (e) => {
  e.preventDefault();
  if (!draggedPiece || !sourceSquare) return;

  const targetSquare = e.target.closest(".square").dataset.position;
  attemptMove(sourceSquare, targetSquare);
};

// Game logic
const attemptMove = (from, to) => {
  const move = { from, to, promotion: "q" };
  const legalMove = chess.move(move);

  if (legalMove) {
    socket.emit("move", move);
    updateGameState(legalMove);
  }
};

const updateGameState = (move) => {
  lastMoveSquares = [move.from, move.to];
  moveHistory.push(`${moveHistory.length + 1}. ${move.san}`);
  updateGameStatus();
  updateMoveHistory();
  renderBoard();
};

// UI updates
const updateGameStatus = () => {
  let statusText = `${chess.turn() === "w" ? "White" : "Black"} to move`;

  if (chess.isCheckmate()) {
    statusText = `Checkmate! ${chess.turn() === "w" ? "Black" : "White"} wins!`;
  } else if (chess.isDraw()) {
    statusText = "Game drawn!";
  } else if (chess.isCheck()) {
    statusText = `${chess.turn() === "w" ? "White" : "Black"} in check!`;
  }

  gameStatusElement.textContent = statusText;

  // Highlight the active player
  player1Element.classList.toggle("active", chess.turn() === "w");
  player2Element.classList.toggle("active", chess.turn() === "b");
};

const updateMoveHistory = () => {
  moveHistoryElement.innerHTML = moveHistory.join("<br>");
  moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
};

// Visual effects
const highlightLastMove = () => {
  lastMoveSquares.forEach((square) => {
    const element = document.querySelector(`[data-position="${square}"]`);
    element?.classList.add("highlight");
  });
  setTimeout(
    () =>
      document
        .querySelectorAll(".highlight")
        .forEach((el) => el.classList.remove("highlight")),
    1000
  );
};

const highlightCheck = () => {
  document
    .querySelectorAll(".check")
    .forEach((el) => el.classList.remove("check"));

  if (chess.isCheck()) {
    // Find the king's position for the side to move
    const kingSquare = findKingSquare(chess.turn());
    if (kingSquare) {
      document
        .querySelector(`[data-position="${kingSquare}"]`)
        ?.classList.add("check");
    }
  }
};

function findKingSquare(color) {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.type === "k" && sq.color === color) {
        return `${String.fromCharCode(97 + c)}${8 - r}`;
      }
    }
  }
  return null;
}

// Game controls
document.getElementById("flip-board")?.addEventListener("click", () => {
  playerRole = playerRole === "w" ? "b" : "w";
  renderBoard();
});

document.getElementById("new-game")?.addEventListener("click", () => {
  chess.reset();
  moveHistory = [];
  socket.emit("newGame");
  initializeGame();
});

document.getElementById("undo-move")?.addEventListener("click", () => {
  if (chess.undo()) {
    moveHistory.pop();
    socket.emit("undoMove");
    initializeGame();
  }
});

// Socket handlers
socket.on("playerRole", (role) => {
  playerRole = role;
  initializeGame();
});

socket.on("spectatorRole", () => {
  playerRole = null;
  initializeGame();
});

socket.on("boardState", (fen) => {
  chess.load(fen);
  initializeGame();
});

socket.on("move", (move) => {
  chess.move(move);
  updateGameState(move);
});

socket.on("playerStatus", ({ white, black }) => {
  // Player 1 (White)
  if (white && white.connected) {
    player1Element.textContent = `Player 1 (White): ${
      white.name || "Connected"
    }`;
  } else {
    player1Element.textContent = "Player 1 (White): Waiting...";
  }

  // Player 2 (Black)
  if (black && black.connected) {
    player2Element.textContent = `Player 2 (Black): ${
      black.name || "Connected"
    }`;
  } else {
    player2Element.textContent = "Player 2 (Black): Waiting...";
  }
});

// Initial setup
initializeGame();
