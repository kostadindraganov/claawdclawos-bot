import { WebSocket, WebSocketServer } from "ws";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { type DB, openDatabase } from "./db.js";
import { type Config, loadConfig } from "./config.js";
import { orchestrate } from "./orchestrator.js";
import { logger } from "./logger.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const WARROOM_DIR = resolve(PROJECT_ROOT, "warroom");
const WARROOM_PORT = 7860;

let pythonProcess: ChildProcess | null = null;
let bridgeWss: WebSocketServer | null = null;

export function startWarRoom(): ChildProcess | null {
  const serverPy = resolve(WARROOM_DIR, "server.py");
  if (!existsSync(serverPy)) {
    logger.warn("warroom: server.py not found, skipping");
    return null;
  }

  const venvPython = resolve(WARROOM_DIR, ".venv", "bin", "python");
  const pythonCmd = existsSync(venvPython) ? venvPython : "python3";

  logger.info(`warroom: starting Pipecat server on :${WARROOM_PORT}`);

  pythonProcess = spawn(pythonCmd, [serverPy], {
    cwd: WARROOM_DIR,
    env: { ...process.env, WARROOM_PORT: String(WARROOM_PORT) },
    stdio: ["pipe", "pipe", "pipe"],
  });

  pythonProcess.stdout?.on("data", (data: Buffer) => {
    logger.debug(`warroom: ${data.toString().trim()}`);
  });

  pythonProcess.stderr?.on("data", (data: Buffer) => {
    logger.warn(`warroom: ${data.toString().trim()}`);
  });

  pythonProcess.on("exit", (code) => {
    logger.info(`warroom: process exited with code ${code}`);
    pythonProcess = null;
  });

  return pythonProcess;
}

async function handleUtterance(
  ws: WebSocket,
  db: DB,
  config: Config,
  agentId: string | undefined,
  text: string,
  sessionId: string | undefined,
): Promise<void> {
  const chatId = `warroom:${sessionId ?? "default"}`;
  // Prepend @agentId: prefix when a specific non-main agent is targeted
  const routedText =
    agentId && agentId !== "main" ? `@${agentId}: ${text}` : text;

  try {
    const results = await orchestrate({ db, config, chatId, text: routedText });
    const first = results[0];
    if (first) {
      ws.send(
        JSON.stringify({
          type: "response",
          agent_id: first.agentId,
          text: first.result.text,
          session_id: sessionId,
        }),
      );
    } else {
      ws.send(
        JSON.stringify({ type: "error", message: "No agent responded", session_id: sessionId }),
      );
    }
  } catch (err) {
    logger.error("warroom: utterance processing failed", { err: String(err) });
    ws.send(JSON.stringify({ type: "error", message: "Processing failed", session_id: sessionId }));
  }
}

export function startBridge(db: DB, config: Config, nodePort = 7861): WebSocketServer {
  bridgeWss = new WebSocketServer({ port: nodePort });
  logger.info(`warroom: bridge listening on :${nodePort}`);

  bridgeWss.on("connection", (ws: WebSocket) => {
    logger.debug("warroom: bridge client connected");

    ws.on(
      "message",
      (rawData: Buffer | string) => {
        let msg: { type?: string; agent_id?: string; text?: string; session_id?: string; action?: string };
        try {
          msg = JSON.parse(rawData.toString()) as typeof msg;
        } catch {
          return;
        }

        if (msg.type === "utterance" && msg.text) {
          void handleUtterance(ws, db, config, msg.agent_id, msg.text, msg.session_id);
        } else if (msg.type === "hive_mind") {
          logger.debug(`warroom: hive mind log: ${msg.agent_id ?? "?"} ${msg.action ?? "?"}`);
        }
      },
    );

    ws.on("close", () => logger.debug("warroom: bridge client disconnected"));
    ws.on("error", (err: Error) =>
      logger.warn("warroom: bridge client error", { err: err.message }),
    );
  });

  return bridgeWss;
}

export function stopWarRoom(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
  if (bridgeWss) {
    bridgeWss.close();
    bridgeWss = null;
  }
  logger.info("warroom: stopped");
}

// ── Standalone entry point ─────────────────────────────────────────────

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].includes("agent-voice-bridge") ||
    process.argv[1].includes("warroom"));

if (isDirectRun) {
  logger.info("warroom: starting standalone mode");

  const standaloneConfig = loadConfig(resolve(PROJECT_ROOT, ".env"));
  const standaloneDb = openDatabase(standaloneConfig.dbPath);

  const py = startWarRoom();
  if (!py) {
    const venvPath = resolve(WARROOM_DIR, ".venv");
    if (!existsSync(venvPath)) {
      console.log(
        "\nWar Room Python environment not set up yet.\n" +
        "  cd warroom && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt\n",
      );
    }
    process.exit(1);
  }

  const bridge = startBridge(standaloneDb, standaloneConfig);

  console.log(
    "\nCLAUDECLAW War Room\n" +
    `  Python server: http://localhost:${WARROOM_PORT}\n` +
    "  Node bridge:   ws://localhost:7861\n" +
    `  Web UI:        http://localhost:${WARROOM_PORT}\n`,
  );

  const shutdown = () => {
    stopWarRoom();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  py.on("exit", (code) => {
    if (code !== 0) logger.error(`warroom: Python server crashed with code ${code}`);
    bridge.close();
    process.exit(code ?? 1);
  });
}
