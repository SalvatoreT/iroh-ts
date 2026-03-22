import { Endpoint, EndpointAddr } from "iroh";
import "poker-card-element";
import { PokerGame } from "./game.js";
import type { Card, HostMessage, PlayerMessage } from "./protocol.js";
import { encode, decode } from "./protocol.js";

const ALPN = new TextEncoder().encode("iroh-poker/1");

const statusEl = document.getElementById("status")!;
const communityEl = document.getElementById("community")!;
const potEl = document.getElementById("pot")!;
const handEl = document.getElementById("hand")!;
const playersEl = document.getElementById("players")!;
const actionsEl = document.getElementById("actions")!;
const resultEl = document.getElementById("result")!;
const btnBet = document.getElementById("btn-bet") as HTMLButtonElement;
const btnCheck = document.getElementById("btn-check") as HTMLButtonElement;
const btnFold = document.getElementById("btn-fold") as HTMLButtonElement;
const betAmountEl = document.getElementById("bet-amount") as HTMLInputElement;

function renderCards(container: HTMLElement, cards: Card[], faceDown = false) {
  container.innerHTML = "";
  for (const card of cards) {
    const el = document.createElement("playing-card") as any;
    if (faceDown) {
      // No rank/suit = face down
    } else {
      el.setAttribute("rank", card.rank);
      el.setAttribute("suit", card.suit);
    }
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

// --- Write/read helpers ---
async function sendMsg(
  send: { writeAll: (d: Uint8Array) => Promise<void> },
  msg: PlayerMessage | HostMessage,
) {
  const bytes = encode(msg);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
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

  const game = new PokerGame();
  game.addPlayer("Host");

  const conn = await endpoint.accept();
  if (!conn) return;

  game.addPlayer(`Player ${game.players.length}`);
  statusEl.textContent = `Opponent connected! Dealing...`;

  // Accept stream from player (they write first)
  const stream = await conn.acceptBi();

  // Deal and send initial state
  game.deal();

  // Send deal to player (their hand)
  await sendMsg(stream.send, {
    kind: "deal",
    hand: game.players[1].hand,
    community: [],
  } satisfies HostMessage);

  // Show host's own hand
  renderCards(handEl, game.players[0].hand);

  // Send state
  const broadcastState = async () => {
    const stateMsg: HostMessage = {
      kind: "state",
      players: game.getPlayerStates(),
      pot: game.pot,
      community: game.community,
      currentPlayer: game.currentPlayer,
      phase: game.phase,
    };
    await sendMsg(stream.send, stateMsg);
    renderState(stateMsg, 0);
  };

  await broadcastState();

  // Host action handlers
  const doAction = async (action: PlayerMessage) => {
    if (action.kind !== "action") return;
    game.applyAction(0, action.action);
    if (game.phase === "showdown") {
      const result = game.getWinner();
      const resultMsg: HostMessage = { kind: "result", winner: result.name, winningHand: result.handName, pot: game.pot };
      await sendMsg(stream.send, resultMsg);
      resultEl.textContent = `${result.name} wins with ${result.handName}! ($${game.pot})`;
      actionsEl.style.display = "none";
    } else {
      await broadcastState();
    }
  };

  btnBet.onclick = () => doAction({ kind: "action", action: { type: "bet", amount: parseInt(betAmountEl.value) } });
  btnCheck.onclick = () => doAction({ kind: "action", action: { type: "check" } });
  btnFold.onclick = () => doAction({ kind: "action", action: { type: "fold" } });

  // Read player actions
  const allData = await stream.recv.readToEnd(1024 * 1024);
  let offset = 0;
  while (offset + 4 <= allData.length) {
    const len = new DataView(allData.buffer, allData.byteOffset + offset, 4).getUint32(0);
    offset += 4;
    if (offset + len > allData.length) break;
    const msg = decode(allData.subarray(offset, offset + len)) as PlayerMessage;
    offset += len;

    if (msg.kind === "action") {
      game.applyAction(1, msg.action);
      if (game.phase === "showdown") {
        const result = game.getWinner();
        const resultMsg: HostMessage = { kind: "result", winner: result.name, winningHand: result.handName, pot: game.pot };
        await sendMsg(stream.send, resultMsg);
        resultEl.textContent = `${result.name} wins with ${result.handName}! ($${game.pot})`;
        actionsEl.style.display = "none";
      } else {
        await broadcastState();
      }
    }
  }
}

async function joinGame(endpoint: Endpoint, ticket: string) {
  statusEl.textContent = "Connecting to poker room...";
  const addr = EndpointAddr.fromEndpointId(ticket);
  const conn = await endpoint.connect(addr, ALPN);
  statusEl.textContent = "Connected! Waiting for deal...";

  const stream = await conn.openBi();

  // Send ready message to trigger host's acceptBi
  await sendMsg(stream.send, { kind: "ready" } satisfies PlayerMessage);

  let myIndex = 1;

  // Read all host messages
  const allData = await stream.recv.readToEnd(1024 * 1024);
  let offset = 0;
  while (offset + 4 <= allData.length) {
    const len = new DataView(allData.buffer, allData.byteOffset + offset, 4).getUint32(0);
    offset += 4;
    if (offset + len > allData.length) break;
    const msg = decode(allData.subarray(offset, offset + len)) as HostMessage;
    offset += len;

    switch (msg.kind) {
      case "deal":
        renderCards(handEl, msg.hand);
        statusEl.textContent = "Cards dealt!";
        break;
      case "state":
        renderState(msg, myIndex);
        break;
      case "result":
        resultEl.textContent = `${msg.winner} wins with ${msg.winningHand}! ($${msg.pot})`;
        actionsEl.style.display = "none";
        break;
      case "joined":
        myIndex = msg.playerIndex;
        break;
    }
  }

  // Player action handlers
  btnBet.onclick = () => sendMsg(stream.send, { kind: "action", action: { type: "bet", amount: parseInt(betAmountEl.value) } });
  btnCheck.onclick = () => sendMsg(stream.send, { kind: "action", action: { type: "check" } });
  btnFold.onclick = () => sendMsg(stream.send, { kind: "action", action: { type: "fold" } });
}

main().catch((err) => {
  statusEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
