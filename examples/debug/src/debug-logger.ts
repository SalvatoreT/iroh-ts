export type LogCategory =
  | "endpoint"
  | "connection"
  | "stream"
  | "datagram"
  | "blob"
  | "doc"
  | "error";

export type LogDirection = "send" | "recv" | "local";

export interface LogEntry {
  timestamp: number;
  category: LogCategory;
  direction: LogDirection;
  message: string;
  detail?: string;
}

const CATEGORY_COLORS: Record<LogCategory, string> = {
  endpoint: "#5b9bd5",
  connection: "#70c97a",
  stream: "#b07cd8",
  datagram: "#e8a838",
  blob: "#4ecdc4",
  doc: "#f0d264",
  error: "#e85555",
};

const DIRECTION_ICONS: Record<LogDirection, string> = {
  send: "->",
  recv: "<-",
  local: "**",
};

export type LogSink = (entry: LogEntry) => void;

export function createBrowserLogger(container: HTMLElement): LogSink {
  return (entry: LogEntry) => {
    const color = CATEGORY_COLORS[entry.category];
    const icon = DIRECTION_ICONS[entry.direction];
    const time = formatTime(entry.timestamp);

    const line = document.createElement("div");
    line.className = `log-entry log-${entry.category}`;
    line.innerHTML =
      `<span class="log-time">${time}</span>` +
      `<span class="log-cat" style="color:${color}">[${entry.category}]</span>` +
      `<span class="log-dir">${icon}</span>` +
      `<span class="log-msg">${escapeHtml(entry.message)}</span>` +
      (entry.detail
        ? `<div class="log-detail">${escapeHtml(entry.detail)}</div>`
        : "");

    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  };
}

export function createConsoleLogger(): LogSink {
  const ANSI: Record<LogCategory, string> = {
    endpoint: "\x1b[34m",
    connection: "\x1b[32m",
    stream: "\x1b[35m",
    datagram: "\x1b[33m",
    blob: "\x1b[36m",
    doc: "\x1b[93m",
    error: "\x1b[31m",
  };
  const RESET = "\x1b[0m";

  return (entry: LogEntry) => {
    const color = ANSI[entry.category];
    const icon = DIRECTION_ICONS[entry.direction];
    const time = formatTime(entry.timestamp);
    const cat = `[${entry.category}]`.padEnd(14);
    const line = `${time} ${color}${cat}${RESET} ${icon} ${entry.message}`;
    console.log(line);
    if (entry.detail) {
      console.log(`                    ${entry.detail}`);
    }
  };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(11, 23);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
