const socket = io();
const chess = new Chess();
const boardElement = document.getElementById("chessboard");
const gameStatusElement = document.getElementById("game-status");
const moveHistoryList = document.getElementById("move-history-list");

const player1Status = document.getElementById("player1");
const player2Status = document.getElementById("player2");
const whiteCapturedPiecesDisplay = document.getElementById(
  "white-captured-pieces"
);
const blackCapturedPiecesDisplay = document.getElementById(
  "black-captured-pieces"
);
const turnDisplay = document.getElementById("turn-display");
const coordinatesContainer = document.getElementById("coordinates-container");

let draggedPiece = null;
let sourceSquare = null;
let myPlayerRole = null;
let lastMoveSquares = [];
let isBoardFlipped = false;

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

const getPieceUnicode = (piece) =>
  UNICODE_PIECES[piece.color === "w" ? piece.type.toUpperCase() : piece.type];

const renderBoard = () => {
  boardElement.innerHTML = "";
  const board = chess.board();

  const rowOrder = isBoardFlipped
    ? [...Array(8).keys()].reverse()
    : [...Array(8).keys()];
  const colOrder = isBoardFlipped
    ? [...Array(8).keys()].reverse()
    : [...Array(8).keys()];

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const rowIndex = rowOrder[i];
      const colIndex = colOrder[j];
      const piece = board[rowIndex][colIndex];
      const squareName = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;

      createSquareElement(i, j, piece, squareName);
    }
  }

  highlightLastMove();
  highlightCheck();
  updateCoordinates();
};

const createSquareElement = (row, col, piece, actualPosition) => {
  const squareElement = document.createElement("div");
  squareElement.className = `square ${
    (row + col) % 2 === 0 ? "light" : "dark"
  }`;
  squareElement.dataset.position = actualPosition;

  if (piece) {
    const pieceElement = document.createElement("div");
    pieceElement.className = `piece ${piece.color}`;
    pieceElement.textContent = getPieceUnicode(piece);
    pieceElement.draggable = myPlayerRole === piece.color;

    pieceElement.addEventListener("dragstart", handleDragStart);
    pieceElement.addEventListener("dragend", handleDragEnd);

    squareElement.appendChild(pieceElement);
  }

  squareElement.addEventListener("dragover", handleDragOver);
  squareElement.addEventListener("drop", handleDrop);
  boardElement.appendChild(squareElement);
};

const handleDragStart = (e) => {
  const parentSquare = e.target.closest(".square");
  if (!parentSquare) return;

  const pieceElement = e.target;
  const pieceColor = pieceElement.className.includes("w") ? "w" : "b";

  if (myPlayerRole !== pieceColor || myPlayerRole !== chess.turn()) {
    e.preventDefault();
    return;
  }

  draggedPiece = e.target;
  sourceSquare = parentSquare.dataset.position;
  e.dataTransfer.setData("text/plain", draggedPiece.id);
  setTimeout(() => (draggedPiece.style.opacity = 0.5), 0);
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

  const targetSquareElement = e.target.closest(".square");
  if (!targetSquareElement) return;

  const targetSquare = targetSquareElement.dataset.position;
  attemptMove(sourceSquare, targetSquare);
};

const attemptMove = (from, to) => {
  const move = { from, to, promotion: "q" };
  socket.emit("move", move);
};

const updateMoveHistory = (san) => {
  const listItem = document.createElement("li");
  listItem.textContent = san;
  moveHistoryList.appendChild(listItem);
  moveHistoryList.scrollTop = moveHistoryList.scrollHeight;
};

const renderCapturedPieces = (captured) => {
  whiteCapturedPiecesDisplay.innerHTML = "";
  blackCapturedPiecesDisplay.innerHTML = "";

  captured.white.forEach((piece) => {
    const pieceElement = document.createElement("span");
    pieceElement.classList.add("piece", "captured-piece");
    pieceElement.textContent = piece.symbol;
    whiteCapturedPiecesDisplay.appendChild(pieceElement);
  });

  captured.black.forEach((piece) => {
    const pieceElement = document.createElement("span");
    pieceElement.classList.add("piece", "captured-piece");
    pieceElement.textContent = piece.symbol;
    blackCapturedPiecesDisplay.appendChild(pieceElement);
  });
};

const updateTurnDisplay = (turnInfo) => {
  const playerName = turnInfo.playerName || "Unknown Player";
  const colorName =
    turnInfo.player.charAt(0).toUpperCase() + turnInfo.player.slice(1);

  turnDisplay.textContent = `${colorName}'s Turn - ${playerName}`;

  if (
    (myPlayerRole === "w" && turnInfo.turn === "w") ||
    (myPlayerRole === "b" && turnInfo.turn === "b")
  ) {
    turnDisplay.classList.add("active");
    turnDisplay.textContent = "Your Turn!";
  } else {
    turnDisplay.classList.remove("active");
  }
};

const highlightLastMove = () => {
  document
    .querySelectorAll(".highlight")
    .forEach((el) => el.classList.remove("highlight"));
  if (lastMoveSquares.length === 2) {
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
  }
};

const highlightCheck = () => {
  document
    .querySelectorAll(".check")
    .forEach((el) => el.classList.remove("check"));

  if (chess.isCheck()) {
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

function updateCoordinates() {
  const rankCoords = coordinatesContainer.querySelectorAll(".rank-coordinate");
  const fileCoords = coordinatesContainer.querySelectorAll(".file-coordinate");

  if (isBoardFlipped) {
    rankCoords.forEach((coord, index) => {
      coord.textContent = index + 1;
    });
    fileCoords.forEach((coord, index) => {
      coord.textContent = String.fromCharCode(104 - index);
    });
  } else {
    rankCoords.forEach((coord, index) => {
      coord.textContent = 8 - index;
    });
    fileCoords.forEach((coord, index) => {
      coord.textContent = String.fromCharCode(97 + index);
    });
  }
}

function setBoardOrientation(role) {
  const shouldBeFlipped = role === "b";

  if (isBoardFlipped !== shouldBeFlipped) {
    isBoardFlipped = shouldBeFlipped;

    const chessboard = document.getElementById("chessboard");
    chessboard.classList.toggle("flipped", isBoardFlipped);
    coordinatesContainer.classList.toggle("flipped", isBoardFlipped);
  }

  renderBoard();
}

socket.on("playerRole", (role) => {
  myPlayerRole = role;
  renderBoard();

  const name = prompt("Enter your name:");
  if (name) {
    socket.emit("setName", name);
  }
});

socket.on("spectatorRole", () => {
  myPlayerRole = null;
  alert("You are a spectator. Two players are already connected.");
  renderBoard();
});

socket.on("playerStatus", (status) => {
  player1Status.textContent = `Player 1 (White): ${
    status.white.connected ? status.white.name || "Connected" : "Waiting..."
  }`;
  player2Status.textContent = `Player 2 (Black): ${
    status.black.connected ? status.black.name || "Connected" : "Waiting..."
  }`;
});

socket.on("turnStatus", (turnInfo) => {
  updateTurnDisplay(turnInfo);
});

socket.on("boardState", (fen) => {
  chess.load(fen);
  renderBoard();
});

socket.on("updateMoveHistory", (san) => {
  updateMoveHistory(san);
});

socket.on("capturedPieces", (captured) => {
  renderCapturedPieces(captured);
});

socket.on("invalidMove", (message) => {
  alert("Invalid Move: " + message);
  renderBoard();
});

socket.on("inCheck", (color) => {
  alert(`${color === "w" ? "White" : "Black"} is in check!`);
});

socket.on("gameOver", (data) => {
  if (data.winner) {
    alert(`Game Over! ${data.winner} wins by ${data.reason}!`);
  } else {
    alert(`Game Over! Draw by ${data.reason}!`);
  }
});

socket.on("gameReset", () => {
  moveHistoryList.innerHTML = "";
  turnDisplay.textContent = "Game Reset - White's Turn";
  turnDisplay.classList.remove("active");
  renderBoard();
});

socket.on("move", (moveData) => {
  if (moveData.from && moveData.to) {
    lastMoveSquares = [moveData.from, moveData.to];
  }
});

document.getElementById("new-game")?.addEventListener("click", function () {
  socket.emit("newGame");
});

document.getElementById("undo-move")?.addEventListener("click", function () {
  socket.emit("undoMove");
});

renderBoard();
