# Glama listing text

Glama builds the card from the GitHub repository and the official MCP registry. If its form asks for text, use this.

**Name:** Speak When Done

**Short description (≤100 chars):**
Voice notifications for AI coding agents: text to speech MCP server that says when the agent is done

**Long description:**
Speak When Done says out loud when your AI coding agent finishes a task or needs your input, so you can look away
from the terminal. It uses your computer's own voice (macOS `say`, Windows SAPI, Linux `spd-say` or `espeak-ng`) in
any language your system supports, and says the first sentence of what the agent did, not just "done". Two tools:
`notify_done` and `speak`. No API keys, no telemetry, zero dependencies; nothing leaves your computer by default.
Optionally, with DuoWave (https://duowave.ai), the free open-source voice assistant, the phrase is said on a smart
speaker in the room. Works with Claude Code (as a plugin with Stop and Notification hooks), Codex, Cursor and any MCP
client.

**Tags:** text-to-speech, notifications, voice, developer-tools, accessibility

**Install:** `npx -y speak-when-done`
