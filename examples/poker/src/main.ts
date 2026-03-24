import { Endpoint, EndpointAddr, type Connection } from "@salvatoret/iroh";
import "poker-card-element";
import { PokerGame } from "./game.js";
import type { Card, HostMessage, PlayerMessage } from "./protocol.js";

const ALPN = new TextEncoder().encode("iroh-poker/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
let currentConn: Connection | null = null;
let connGeneration = 0;
let endpoint: Endpoint | null = null;
let role: "host" | "joiner" = "host";
let peerTicket: string | null = null;
let currentRoundBet = 0;
let myCurrentBet = 0;

function updateState(newState: ConnState, detail?: string) {
  state = newState;
  document.body.dataset.state = newState;
  if (detail) statusTextEl.textContent = detail;
}

// --- Rendering ---

function renderCards(container: HTMLElement, cards: Card[]) {
  container.innerHTML = "";
  for (const card of cards) {
    const el = document.createElement("playing-card") as any;
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
  myCurrentBet = msg.players[myIndex]?.bet ?? 0;

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

function sendMsg(msg: HostMessage | PlayerMessage) {
  if (!currentConn) return;
  try {
    currentConn.sendDatagram(encoder.encode(JSON.stringify(msg)));
  } catch {
    // Datagram send failed — connection likely dead, will be detected by readLoop
  }
}

function parseMsg(data: Uint8Array): HostMessage | PlayerMessage {
  return JSON.parse(decoder.decode(data));
}

// --- Connection management ---

function handleDisconnect() {
  if (state === "disconnected" || state === "reconnecting") return;
  currentConn = null;
  updateState("disconnected", "Opponent disconnected. Waiting...");
  if (role === "joiner") {
    setTimeout(() => connectWithRetry(), 2000);
  }
  // Host: acceptLoop is always running, no action needed
}

/** Read datagrams in a loop, dispatching to handler. Triggers disconnect on exit. */
async function datagramLoop(
  conn: Connection,
  gen: number,
  onMessage: (data: Uint8Array) => void,
) {
  while (true) {
    try {
      const data = await conn.readDatagram();
      onMessage(data);
    } catch {
      break;
    }
  }
  if (gen === connGeneration) {
    handleDisconnect();
  }
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
    const result = game.getWinner();
    sendMsg({ kind: "result", winner: result.name, winningHand: result.handName, pot: game.pot });
    resultEl.textContent = `${result.name} wins with ${result.handName}! ($${game.pot})`;
    actionsEl.style.display = "none";
    waitingBar.style.display = "none";
    newHandBar.style.display = "flex";
  };

  const doHostAction = (action: PlayerMessage) => {
    if (action.kind !== "action") return;
    game.applyAction(0, action.action);
    if (game.phase === "showdown") {
      showResult();
    } else {
      broadcastState();
    }
  };

  btnBet.onclick = () => {
    const amount = parseInt(betAmountEl.value);
    if (currentRoundBet > 0) {
      doHostAction({ kind: "action", action: { type: "raise", amount } });
    } else {
      doHostAction({ kind: "action", action: { type: "bet", amount } });
    }
  };
  btnCheck.onclick = () => {
    if (currentRoundBet > 0) {
      doHostAction({ kind: "action", action: { type: "call" } });
    } else {
      doHostAction({ kind: "action", action: { type: "check" } });
    }
  };
  btnFold.onclick = () => doHostAction({ kind: "action", action: { type: "fold" } });

  btnNewHand.onclick = () => {
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

  // Accept loop — always has accept() pending for instant reconnection
  while (true) {
    try {
      const conn = await endpoint!.accept();
      if (!conn) break;

      connGeneration++;
      const gen = connGeneration;
      currentConn = conn;
      updateState("connected", "Opponent connected!");

      if (!playerAdded) {
        game.addPlayer("Player 2");
        playerAdded = true;
        startHand();
      } else {
        // Reconnection — resync game state
        resyncJoiner();
      }

      // Monitor connection closure
      conn.closed().then(() => {
        if (gen === connGeneration) handleDisconnect();
      });

      // Read player actions
      datagramLoop(conn, gen, (data) => {
        const msg = parseMsg(data) as PlayerMessage;
        if (msg.kind === "action") {
          game.applyAction(1, msg.action);
          if (game.phase === "showdown") {
            showResult();
          } else {
            broadcastState();
          }
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusTextEl.textContent = `Accept error: ${msg}`;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// --- Joiner ---

async function joinGame() {
  const myIndex = 1;

  btnBet.onclick = () => {
    const amount = parseInt(betAmountEl.value);
    if (currentRoundBet > 0) {
      sendMsg({ kind: "action", action: { type: "raise", amount } });
    } else {
      sendMsg({ kind: "action", action: { type: "bet", amount } });
    }
  };
  btnCheck.onclick = () => {
    if (currentRoundBet > 0) {
      sendMsg({ kind: "action", action: { type: "call" } });
    } else {
      sendMsg({ kind: "action", action: { type: "check" } });
    }
  };
  btnFold.onclick = () => sendMsg({ kind: "action", action: { type: "fold" } });

  const handleHostMessage = (data: Uint8Array) => {
    const msg = parseMsg(data) as HostMessage;
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

  await connectWithRetry(handleHostMessage);
}

async function connectWithRetry(onMessage?: (data: Uint8Array) => void) {
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

      connGeneration++;
      const gen = connGeneration;
      currentConn = conn;
      updateState("connected", "Connected! Waiting for deal...");

      conn.closed().then(() => {
        if (gen === connGeneration) handleDisconnect();
      });

      if (onMessage) {
        datagramLoop(conn, gen, onMessage);
      }
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
