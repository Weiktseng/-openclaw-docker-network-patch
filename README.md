# OpenClaw Docker Network Patch + Local LLM Bypass

> **This is not the official OpenClaw repo.** This is a community patch that fixes Docker connectivity issues and adds a command-router plugin.
>
> Official repo: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)

Fixes Docker connectivity issues and adds a command-router plugin to bypass the main (expensive) model in [OpenClaw](https://github.com/openclaw/openclaw).

## Scope of this Patch

1. Fixes Docker `env_file` and network configuration for headless deployment.
2. Adds Python runtime in Docker so tools run locally without external web APIs.
3. Fixes ACP client arg forwarding for Docker inside/outside gateway connectivity.
4. Adds a plugin to route commands directly to cheaper sub-agents, bypassing the main LLM.

*Note: This modification solves specifically the connectivity and cost issues I encountered. I am not a DevOps expert. Use with caution.*

## What's Changed

### Docker Network Fix
- **`env_file` instead of hardcoded vars**: All secrets load from `.env` — no more `${VAR}` errors in `docker-compose.yml`
- **Python runtime in Docker**: Custom `Dockerfile.openclaw-python` adds Python + pip so tools can run locally without external web APIs

### ACP Client Fix
- **`src/acp/client.ts`**: When a custom `serverCommand` is provided, the client no longer prepends the `"acp"` prefix to args
- **`src/cli/acp-cli.ts`**: Added `--url`, `--token`, `--password`, `--session`, `--session-label`, `--reset-session` options that forward to the ACP server — enables connecting to the gateway from inside/outside Docker

### Command Router Plugin (LLM Bypass)
A plugin that routes slash commands directly to sub-agents, bypassing the main (expensive) model. Commands are fully configurable via environment variables — define your own agent shortcuts to match your setup.

## Quick Start

```bash
# 1. Clone and enter the repo
git clone https://github.com/Weiktseng/-openclaw-docker-network-patch.git
cd -openclaw-docker-network-patch

# 2. Build the base OpenClaw image first (see official docs)
# This creates the openclaw:local image
docker build -t openclaw:local .

# 3. Copy and configure .env
cp .env.example .env
# Edit .env with your API keys and paths

# 4. Start the gateway
docker compose up -d openclaw-gateway

# 5. Open the web UI
# http://localhost:18789
```

## Command Router Plugin Setup

**Prerequisite:** You need sub-agents configured in your OpenClaw setup. The plugin routes commands to agents by their ID. If those agents don't exist, the commands will fail.

The plugin is included in `extensions/command-router/`. To use it:

1. Copy `extensions/command-router/` to your OpenClaw config directory:
   ```bash
   cp -r extensions/command-router ~/.openclaw/extensions/
   ```
2. Configure your agents in `.env` (see below)
3. Restart the gateway
4. Test with your configured command in the webchat

### Configuration

Set these environment variables to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_CLI_PATH` | `node /app/openclaw.mjs` | Path to the OpenClaw CLI binary |
| `COMMAND_ROUTER_AGENTS` | *(none — you must define your own)* | Agent definitions (see format below) |
| `PERSONA_SCRIPT_PATH` | (empty, disables /persona) | Path to persona toggle script |

### Custom Agent Definitions

The `COMMAND_ROUTER_AGENTS` env var uses the format: `command:agent_id:description:timeout_sec`

Examples:
```bash
# Single cheap agent:
COMMAND_ROUTER_AGENTS="quick:haiku:Fast cheap agent:60"

# Two agents:
COMMAND_ROUTER_AGENTS="cheap:sonnet:Sonnet agent:90,eng:engineer:Engineer agent:300"
```

## File Changes from Upstream

```
Modified:
  docker-compose.yml          — env_file, Python image, simplified config
  src/acp/client.ts           — serverCommand prefix fix
  src/cli/acp-cli.ts          — gateway connection arg forwarding

Added:
  .env.example                — Docker env template (appended to upstream)
  Dockerfile.openclaw-python  — Python runtime layer
  openclaw-python-requirements.txt
  extensions/command-router/  — Sub-agent command routing plugin
```

## Self-Healing with Opus

If you run OpenClaw with an Opus-class model (e.g. Claude Opus 4), it can diagnose and fix issues in this patch by itself. Point it at the source, describe the bug, and let it work. Most connectivity and plugin issues can be resolved in a single session.

## License

MIT (same as upstream OpenClaw)
