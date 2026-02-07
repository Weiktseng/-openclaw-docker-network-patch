/**
 * Command Router Plugin
 *
 * Lightweight command dispatcher — bypasses the main (expensive) agent
 * and routes slash commands directly to sub-agents.
 *
 * Why: If your main agent uses an expensive model (e.g. Opus), you don't
 * want it to act as a relay — receiving a message, forwarding it to a
 * sub-agent, and then relaying the response back. That burns tokens twice.
 * This plugin sends messages directly to sub-agents via CLI, skipping
 * the main model entirely.
 *
 * Configuration (environment variables):
 *   OPENCLAW_CLI_PATH       — Path to openclaw CLI (default: node /app/openclaw.mjs)
 *   COMMAND_ROUTER_AGENTS   — Comma-separated list of agent definitions:
 *                             "command:agent_id:description:timeout_sec"
 *                             Example: "GE:ge:Gemini agent:120,eng:engineer:Engineer agent:300"
 *   PERSONA_SCRIPT_PATH     — (optional) Path to persona toggle script
 *
 * Installation:
 *   1. Copy this folder to ~/.openclaw/extensions/command-router/
 *   2. Set COMMAND_ROUTER_AGENTS in your .env (or use the defaults below)
 *   3. Restart the gateway
 *   4. Send /GE hello to test
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// --- Configuration ---
const OPENCLAW_CLI = process.env.OPENCLAW_CLI_PATH ?? "node /app/openclaw.mjs";
const PERSONA_SCRIPT = process.env.PERSONA_SCRIPT_PATH ?? "";

// Default agent definitions: "command:agent_id:description:timeout_sec"
const DEFAULT_AGENTS = "GE:ge:Send to GE agent (bypasses main):120,eng:engineer:Send to Engineer agent (bypasses main):300";
const AGENT_DEFS = process.env.COMMAND_ROUTER_AGENTS ?? DEFAULT_AGENTS;

type AgentDef = {
  command: string;
  agentId: string;
  description: string;
  timeoutSec: number;
};

function parseAgentDefs(raw: string): AgentDef[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [command, agentId, description, timeout] = entry.split(":");
      if (!command || !agentId) return null;
      return {
        command: command.trim(),
        agentId: agentId.trim(),
        description: description?.trim() || `Send to ${agentId} agent`,
        timeoutSec: parseInt(timeout?.trim() || "120", 10),
      };
    })
    .filter((def): def is AgentDef => def !== null);
}

export default function (api: any) {
  const logger = api.logger;

  logger.info("[command-router] Initializing...");

  const agents = parseAgentDefs(AGENT_DEFS);

  for (const agent of agents) {
    api.registerCommand({
      name: agent.command,
      description: `${agent.description} — bypasses main agent`,
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: any) => {
        const message = ctx.args?.trim();
        if (!message) {
          return { text: `Usage: /${agent.command} <message>` };
        }

        logger.info(`[command-router] /${agent.command}: ${message.slice(0, 50)}...`);

        try {
          const escaped = message.replace(/"/g, '\\"').replace(/`/g, '\\`');
          const { stdout } = await execAsync(
            `${OPENCLAW_CLI} agent --agent ${agent.agentId} --message "${escaped}" --timeout ${agent.timeoutSec}`,
            { timeout: (agent.timeoutSec + 10) * 1000 }
          );

          return { text: stdout.trim() || `(${agent.command}: no response)` };
        } catch (err: any) {
          logger.error(`[command-router] /${agent.command} error: ${err.message}`);
          return { text: `Error: ${err.message}` };
        }
      },
    });
  }

  // /persona on|off — Toggle persona mode (optional, requires script)
  if (PERSONA_SCRIPT) {
    api.registerCommand({
      name: "persona",
      description: "Toggle persona mode (on/off)",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx: any) => {
        const args = ctx.args?.trim() || "status";
        logger.info(`[command-router] /persona ${args}`);
        try {
          const { stdout } = await execAsync(`${PERSONA_SCRIPT} ${args}`, { timeout: 5000 });
          return { text: stdout.trim() };
        } catch (err: any) {
          logger.error(`[command-router] /persona error: ${err.message}`);
          return { text: `Error: ${err.message}` };
        }
      },
    });
  }

  const commandNames = agents.map((a) => `/${a.command}`);
  if (PERSONA_SCRIPT) commandNames.push("/persona");
  logger.info(`[command-router] Loaded: ${commandNames.join(", ")}`);
}
