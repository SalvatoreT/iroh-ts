import { Endpoint, EndpointAddr, type Connection } from "@salvatoret/iroh";
import "poker-card-element";
import { PokerGame } from "./game.js";
import type { Card, HostMessage, PlayerMessage } from "./protocol.js";

const ALPN = new TextEncoder().encode("iroh-poker/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
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
  btnBet.disabled = !isMyTurn;
  btnCheck.disabled = !isMyTurn;
  btnFold.disabled = !isMyTurn;
}

function sendMsg(conn: Connection, msg: HostMessage | PlayerMessage) {
  conn.sendDatagram(encoder.encode(JSON.stringify(msg)));
}

function parseMsg(data: Uint8Array): HostMessage | PlayerMessage {
  return JSON.parse(decoder.decode(data));
}

// --- Main ---
async function main() {
  const params = new URLSearchParams(window.location.search);
  const ticket = params.get("ticket");

  const endpoint = await Endpoint.create();
  await endpoint.online();

  if (ticket) {
    await joinGame(endpoint, ticket);
  } else {
    await hostGame(endpoint);
  }
}

async function hostGame(endpoint: Endpoint) {
  endpoint.setAlpns([ALPN]);
  const addr = endpoint.endpointAddr();
  const id = addr.endpointId();
  const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${id}`;
  statusEl.innerHTML = `Waiting for opponent... Share: <a href="${joinUrl}">${joinUrl}</a>`;
  addr.free();

  const game = new PokerGame();
  game.addPlayer("Host");

  const conn = await endpoint.accept();
  if (!conn) return;

  game.addPlayer(`Player 2`);

  const broadcastState = () => {
    const stateMsg: HostMessage = {
      kind: "state",
      players: game.getPlayerStates(),
      pot: game.pot,
      community: game.community,
      currentPlayer: game.currentPlayer,
      phase: game.phase,
    };
    sendMsg(conn, stateMsg);
    renderState(stateMsg, 0);
  };

  const startHand = () => {
    statusEl.textContent = `Dealing...`;
    resultEl.textContent = "";
    newHandBar.style.display = "none";

    game.deal();

    sendMsg(conn, {
      kind: "deal",
      hand: game.players[1].hand,
      community: [],
    } satisfies HostMessage);

    renderCards(handEl, game.players[0].hand);
    broadcastState();
  };

  const showResult = () => {
    const result = game.getWinner();
    sendMsg(conn, { kind: "result", winner: result.name, winningHand: result.handName, pot: game.pot });
    resultEl.textContent = `${result.name} wins with ${result.handName}! ($${game.pot})`;
    actionsEl.style.display = "none";
    newHandBar.style.display = "flex";
  };

  // Host action handlers
  const doHostAction = (action: PlayerMessage) => {
    if (action.kind !== "action") return;
    game.applyAction(0, action.action);
    if (game.phase === "showdown") {
      showResult();
    } else {
      broadcastState();
    }
  };

  btnBet.onclick = () => doHostAction({ kind: "action", action: { type: "bet", amount: parseInt(betAmountEl.value) } });
  btnCheck.onclick = () => doHostAction({ kind: "action", action: { type: "check" } });
  btnFold.onclick = () => doHostAction({ kind: "action", action: { type: "fold" } });

  btnNewHand.onclick = () => {
    sendMsg(conn, { kind: "new-hand" });
    startHand();
  };

  // Start first hand
  startHand();

  // Read player actions via datagrams
  while (true) {
    try {
      const data = await conn.readDatagram();
      const msg = parseMsg(data) as PlayerMessage;
      if (msg.kind === "action") {
        game.applyAction(1, msg.action);
        if (game.phase === "showdown") {
          showResult();
        } else {
          broadcastState();
        }
      }
    } catch {
      break;
    }
  }
}

async function joinGame(endpoint: Endpoint, ticket: string) {
  statusEl.textContent = "Connecting to poker room...";
  const addr = EndpointAddr.fromEndpointId(ticket);
  const conn = await endpoint.connect(addr, ALPN);
  statusEl.textContent = "Connected! Waiting for deal...";
  addr.free();

  const myIndex = 1;

  // Player action handlers
  btnBet.onclick = () => sendMsg(conn, { kind: "action", action: { type: "bet", amount: parseInt(betAmountEl.value) } });
  btnCheck.onclick = () => sendMsg(conn, { kind: "action", action: { type: "check" } });
  btnFold.onclick = () => sendMsg(conn, { kind: "action", action: { type: "fold" } });

  // Read host messages via datagrams
  while (true) {
    try {
      const data = await conn.readDatagram();
      const msg = parseMsg(data) as HostMessage;

      switch (msg.kind) {
        case "deal":
          renderCards(handEl, msg.hand);
          statusEl.textContent = "Cards dealt!";
          resultEl.textContent = "";
          newHandBar.style.display = "none";
          break;
        case "state":
          renderState(msg, myIndex);
          break;
        case "result":
          resultEl.textContent = `${msg.winner} wins with ${msg.winningHand}! ($${msg.pot})`;
          actionsEl.style.display = "none";
          // Player waits for host to start new hand
          break;
        case "new-hand":
          // Host is starting a new hand, wait for deal
          statusEl.textContent = "New hand starting...";
          resultEl.textContent = "";
          newHandBar.style.display = "none";
          break;
      }
    } catch {
      break;
    }
  }
}

main().catch((err) => {
  statusEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
