# Changelog

## 0.1.0

- MCP server on stdio with two tools: `speak` and `notify_done`.
- System voice on macOS (`say`), Windows (SAPI through PowerShell) and Linux (`spd-say`, `espeak-ng`, `espeak`),
  with language, voice and rate.
- Optional DuoWave: a speaker in the room or DuoWave's voice on the computer, with a fallback to the system voice.
- Claude Code plugin "DuoWave Speak": `Stop` and `Notification` hooks say the outcome in one sentence.
- `hook` command for Claude Code hooks (JSON on stdin) and Codex `notify` (JSON as the argument).
