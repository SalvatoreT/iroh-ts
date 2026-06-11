import {
  Endpoint,
  EndpointAddr,
  writeJson,
  readJson,
  type Connection,
  type SendStream,
} from "@salvatoret/iroh";
import "poker-card-element";
import { PokerGame } from "./game.js";
import type { Card, HostMessage, PlayerMessage } from "./protocol.js";

const ALPN = new TextEncoder().encode("iroh-poker/2");

const statusTextEl = document.getElementById("status-text")!;
const communityEl = document.getElementById("community")!;
const potEl = document.getElementById("pot")!;
const handEl = document.getElementById("hand")!;
const playersEl = document.getElementById("players")!;
const actionsEl = document.getElementById("action-bar")!;
const resultEl = document.getElementById("result")!;
const btnBet = document.getElementById("btn-bet") as HTMLButtonElement;
const btnCheck = document.getElementById("btn-check") as HTMLButtonElement;
const btnFold = document.getElementById("btn-fold") as HTMLButtonElement;
const betAmountEl = document.getElementById("bet-amount") as HTMLInputElement;
const newHandBar = document.getElementById("new-hand-bar")!;
const btnNewHand = document.getElementById("btn-new-hand") as HTMLButtonElement;
const waitingBar = document.getElementById("waiting-bar")!;

// --- Module-scope connection state ---
type ConnState = "connecting" | "connected" | "disconnected" | "reconnecting";
let state: ConnState = "connecting";
let sendStream: SendStream | null = null;
let sendQueue: Promise<unknown> = Promise.resolve();
let connGeneration = 0;
let endpoint: Endpoint | null = null;
let role: "host" | "joiner" = "host";
let peerTicket: string | null = null;
let currentRoundBet = 0;

function updateState(newState: ConnState, detail?: string) {
  state = newState;
  document.body.dataset.state = newState;
  if (detail) statusTextEl.textContent = detail;
}

// --- Rendering ---

function renderCards(container: HTMLElement, cards: Card[]) {
  container.innerHTML = "";
  for (const card of cards) {
    const el = document.createElement("playing-card");
    el.setAttribute("rank", card.rank);
    el.setAttribute("suit", card.suit);
    container.appendChild(el);
  }
}

function renderState(msg: Extract<HostMessage, { kind: "state" }>, myIndex: number) {
  renderCards(communityEl, msg.community);
  potEl.textContent = `Pot: $${msg.pot}`;

  playersEl.innerHTML = "";
  for (let i = 0; i < msg.players.length; i++) {
    const p = msg.players[i];
    const div = document.createElement("div");
    div.className = `player-info${i === msg.currentPlayer ? " current" : ""}${p.folded ? " folded" : ""}`;
    div.innerHTML = `<strong>${p.name}${i === myIndex ? " (you)" : ""}</strong><br>$${p.chips} ${p.bet > 0 ? `(bet: $${p.bet})` : ""}`;
    playersEl.appendChild(div);
  }

  const isMyTurn = msg.currentPlayer === myIndex && msg.phase !== "showdown" && msg.phase !== "waiting";
  actionsEl.style.display = isMyTurn ? "flex" : "none";
  waitingBar.style.display = !isMyTurn && msg.phase !== "showdown" && msg.phase !== "waiting" ? "block" : "none";
  btnBet.disabled = !isMyTurn;
  btnCheck.disabled = !isMyTurn;
  btnFold.disabled = !isMyTurn;

  // Track round bet for button handlers
  currentRoundBet = msg.roundBet;

  // Dynamic button labels based on whether there's an outstanding bet
  if (msg.roundBet > 0) {
    const toCall = msg.roundBet - (msg.players[myIndex]?.bet ?? 0);
    btnBet.textContent = "Raise";
    btnCheck.textContent = `Call $${toCall}`;
  } else {
    btnBet.textContent = "Bet";
    btnCheck.textContent = "Check";
  }
}

// --- Messaging ---

/**
 * Send a message as a JSON frame on the bi-stream. Writes are chained on a
 * queue so multi-message sequences (deal, then state) keep their order.
 */
function sendMsg(msg: HostMessage | PlayerMessage) {
  const stream = sendStream;
  if (!stream) return;
  sendQueue = sendQueue
    .then(() => writeJson(stream, msg))
    .catch(() => {
      // Write failed — connection likely dead; the read loop handles it.
    });
}

/** Read the bet/raise amount from the input; null if not a positive integer. */
function readBetAmount(): number | null {
  const amount = parseInt(betAmountEl.value, 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return amount;
}

// --- Connection management ---

function handleDisconnect() {
  if (state === "disconnected" || state === "reconnecting") return;
  sendStream = null;
  updateState("disconnected", "Opponent disconnected. Waiting...");
  if (role === "joiner") {
    setTimeout(() => connectWithRetry(), 2000);
  }
  // Host: acceptLoop is always running, no action needed
}

/**
 * Open/accept the bi-stream on a fresh connection, register it as the active
 * send stream, and pump incoming messages to the handler. Used for initial
 * connections AND reconnects, so message handling can never be dropped.
 */
async function attachConnection(
  conn: Connection,
  onMessage: (msg: HostMessage | PlayerMessage) => void,
): Promise<number> {
  connGeneration++;
  const gen = connGeneration;

  let stream;
  if (role === "host") {
    // acceptBi resolves once the joiner opens the stream and writes "ready"
    stream = await conn.acceptBi();
  } else {
    stream = await conn.openBi();
  }

  sendStream = stream.send;
  sendQueue = Promise.resolve();
  if (role === "joiner") {
    sendMsg({ kind: "ready" });
  }
  updateState("connected", "Opponent connected!");

  conn.closed().then(() => {
    if (gen === connGeneration) handleDisconnect();
  });

  // Pump messages in the background until the stream ends
  (async () => {
    try {
      for await (const msg of readJson<HostMessage | PlayerMessage>(stream.recv)) {
        if (gen !== connGeneration) return; // superseded by a newer connection
        onMessage(msg);
      }
    } catch {
      // Stream error — treat like a disconnect below
    }
    if (gen === connGeneration) handleDisconnect();
  })();

  return gen;
}

// --- Host ---

async function hostGame() {
  endpoint!.setAlpns([ALPN]);
  const addr = endpoint!.endpointAddr();
  const id = addr.endpointId();
  const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${id}`;
  statusTextEl.innerHTML = `Waiting for opponent... Share: <a href="${joinUrl}">${joinUrl}</a>`;
  addr.free();

  const game = new PokerGame();
  game.addPlayer("Host");
  let playerAdded = false;

  const broadcastState = () => {
    const stateMsg: HostMessage = {
      kind: "state",
      players: game.getPlayerStates(),
      pot: game.pot,
      community: game.community,
      currentPlayer: game.currentPlayer,
      phase: game.phase,
      roundBet: game.roundBet,
    };
    sendMsg(stateMsg);
    renderState(stateMsg, 0);
  };

  const startHand = () => {
    statusTextEl.textContent = "Dealing...";
    resultEl.textContent = "";
    newHandBar.style.display = "none";

    game.deal();

    sendMsg({
      kind: "deal",
      hand: game.players[1].hand,
      community: [],
    } satisfies HostMessage);

    renderCards(handEl, game.players[0].hand);
    broadcastState();
  };

  const showResult = () => {
    const result = game.settle();
    const winner = result.winnerNames.join(" & ");
    sendMsg({ kind: "result", winner, winningHand: result.handName, pot: result.pot });
    resultEl.textContent = `${winner} wins with ${result.handName}! ($${result.pot})`;
    actionsEl.style.display = "none";
    waitingBar.style.display = "none";
    newHandBar.style.display = "flex";
    // Broadcast once more so both sides see the post-showdown chip counts
    broadcastState();
  };

  const applyAndBroadcast = (playerIndex: number, msg: PlayerMessage) => {
    if (msg.kind !== "action") return;
    if (!game.applyAction(playerIndex, msg.action)) return;
    if (game.phase === "showdown") {
      showResult();
    } else {
      broadcastState();
    }
  };

  btnBet.onclick = () => {
    const amount = readBetAmount();
    if (amount === null) return;
    const type = currentRoundBet > 0 ? "raise" : "bet";
    applyAndBroadcast(0, { kind: "action", action: { type, amount } });
  };
  btnCheck.onclick = () => {
    const type = currentRoundBet > 0 ? "call" : "check";
    applyAndBroadcast(0, { kind: "action", action: { type } });
  };
  btnFold.onclick = () => applyAndBroadcast(0, { kind: "action", action: { type: "fold" } });

  btnNewHand.onclick = () => {
    if (state !== "connected") return;
    sendMsg({ kind: "new-hand" });
    startHand();
  };

  // Resync joiner with current game state after reconnect
  const resyncJoiner = () => {
    if (game.phase !== "waiting") {
      sendMsg({
        kind: "deal",
        hand: game.players[1].hand,
        community: game.community,
      } satisfies HostMessage);
      broadcastState();
    }
  };

  // Accept loop — always has accept() pending for instant reconnection.
  // Stream setup runs per-connection without blocking the loop, so a peer
  // that connects but never opens a stream can't wedge the host.
  while (true) {
    try {
      const conn = await endpoint!.accept();
      if (!conn) break;

      attachConnection(conn, (msg) => applyAndBroadcast(1, msg as PlayerMessage))
        .then(() => {
          if (!playerAdded) {
            game.addPlayer("Player 2");
            playerAdded = true;
            startHand();
          } else {
            resyncJoiner();
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          statusTextEl.textContent = `Stream setup error: ${msg}`;
        });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusTextEl.textContent = `Accept error: ${msg}`;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// --- Joiner ---

function makeHostMessageHandler(myIndex: number) {
  return (raw: HostMessage | PlayerMessage) => {
    const msg = raw as HostMessage;
    switch (msg.kind) {
      case "deal":
        renderCards(handEl, msg.hand);
        statusTextEl.textContent = "Cards dealt!";
        resultEl.textContent = "";
        newHandBar.style.display = "none";
        break;
      case "state":
        renderState(msg, myIndex);
        break;
      case "result":
        resultEl.textContent = `${msg.winner} wins with ${msg.winningHand}! ($${msg.pot})`;
        actionsEl.style.display = "none";
        waitingBar.style.display = "none";
        break;
      case "new-hand":
        statusTextEl.textContent = "New hand starting...";
        resultEl.textContent = "";
        newHandBar.style.display = "none";
        break;
    }
  };
}

function joinGame() {
  btnBet.onclick = () => {
    const amount = readBetAmount();
    if (amount === null) return;
    const type = currentRoundBet > 0 ? "raise" : "bet";
    sendMsg({ kind: "action", action: { type, amount } });
  };
  btnCheck.onclick = () => {
    const type = currentRoundBet > 0 ? "call" : "check";
    sendMsg({ kind: "action", action: { type } });
  };
  btnFold.onclick = () => sendMsg({ kind: "action", action: { type: "fold" } });

  return connectWithRetry();
}

const handleHostMessage = makeHostMessageHandler(1);

async function connectWithRetry() {
  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY = 5000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      updateState("reconnecting", `Retrying connection (${attempt}/${MAX_ATTEMPTS - 1})...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    } else {
      updateState("connecting", "Connecting to poker room...");
    }
    try {
      const addr = EndpointAddr.fromEndpointId(peerTicket!);
      const conn = await endpoint!.connect(addr, ALPN);
      addr.free();
      await attachConnection(conn, handleHostMessage);
      updateState("connected", "Connected! Waiting for deal...");
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusTextEl.textContent = `Connection attempt ${attempt + 1} failed: ${msg}`;
    }
  }
  updateState("disconnected", "Could not connect. Please reload.");
}

// --- Main ---

async function main() {
  const params = new URLSearchParams(window.location.search);
  peerTicket = params.get("ticket");

  endpoint = await Endpoint.create();
  await endpoint.online();

  if (peerTicket) {
    role = "joiner";
    await joinGame();
  } else {
    role = "host";
    await hostGame();
  }
}

main().catch((err) => {
  statusTextEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
