# Speak When Done

[![duowaveai/speak-when-done MCP server](https://glama.ai/mcp/servers/duowaveai/speak-when-done/badges/score.svg)](https://glama.ai/mcp/servers/duowaveai/speak-when-done)

**Voice notifications for AI coding agents.** A tiny text to speech MCP server and Claude Code plugin that says out
loud when your agent is done or needs you, so you can look away from the terminal.

- Works on its own with your computer's voice: macOS `say`, Windows speech (SAPI), Linux `spd-say` or `espeak-ng`.
  Any language your system has a voice for.
- Says what happened, not just "done": the first sentence of the agent's last message, with Markdown stripped.
- No accounts, no API keys, no telemetry. Nothing leaves your computer unless you connect DuoWave.
- With [DuoWave](https://duowave.ai), the free open-source voice assistant, you hear it in the room: on a smart
  speaker or in DuoWave's own voice.
- Zero dependencies. Node.js 18.17 or newer.

## Install

### Claude Code: the plugin (recommended)

The plugin speaks on its own after every turn (`Stop` hook) and when Claude waits for your approval or input
(`Notification` hook). It also adds the `speak` tool.

```
/plugin marketplace add duowaveai/speak-when-done
/plugin install duowave-speak@duowave
```

From a terminal: `claude plugin marketplace add duowaveai/speak-when-done`, then
`claude plugin install duowave-speak@duowave`.

Claude Code asks for the plugin's options when you enable it: language, voice and, if you use it, DuoWave's address
and key. All of them can stay empty.

### Claude Code: only the MCP server

```
claude mcp add speak -- npx -y speak-when-done
```

Then ask Claude to "say it out loud when you're done". The server tells the model to call `notify_done` at the end
of a task. A model can forget; the plugin's hooks never do.

### Codex

Speak after every turn with Codex's `notify` setting, in `~/.codex/config.toml`:

```toml
notify = ["npx", "-y", "speak-when-done", "hook"]
```

And, if you also want the tools:

```
codex mcp add speak -- npx -y speak-when-done
```

### Cursor, Windsurf, Claude Desktop and any MCP client

Add the server to the client's MCP config (`~/.cursor/mcp.json` for Cursor):

```json
{
  "mcpServers": {
    "speak": {
      "command": "npx",
      "args": ["-y", "speak-when-done"],
      "env": { "SPEAK_LANGUAGE": "en-US" }
    }
  }
}
```

### From the command line

```
npx -y speak-when-done say "The build is green"
echo "Tests pass" | npx -y speak-when-done say --language en-GB
```

## Tools

| Tool | What it does | Arguments |
|---|---|---|
| `notify_done` | Says that the task is finished or that the agent needs you. The model is asked to call it once, at the end. | `summary` (one sentence), optional `voice`, `language`, `rate` |
| `speak` | Says any short text out loud. | `text`, optional `voice`, `language`, `rate` |

Long text is cut to whole sentences (300 characters by default). Phrases never talk over each other: the next one
waits for the previous one to finish.

## Settings

All settings are environment variables, all optional.

| Variable | What it does |
|---|---|
| `SPEAK_LANGUAGE` | Language as a BCP 47 tag: `en-US`, `de`, `ja`, `ru`… Picks a matching system voice. |
| `SPEAK_VOICE` | A system voice by name: `Samantha` on macOS (`say -v '?'` lists them), `Microsoft Zira Desktop` on Windows. |
| `SPEAK_RATE` | Words per minute, about 175 is normal. |
| `SPEAK_MAX_CHARS` | The longest phrase, 300 by default. |
| `SPEAK_QUIET` | `1` to mute without removing anything. |
| `SPEAK_DONE_TOOL` | `off` to offer only `speak` (the plugin does this: its hook already speaks at the end). |
| `DUOWAVE_URL`, `DUOWAVE_KEY` | Speak through DuoWave instead of the system voice. See below. |
| `DUOWAVE_TARGET` | `auto` (default): a speaker if one is connected, otherwise the computer. Or `speaker`, `computer`. |
| `DUOWAVE_SPEAKER` | A speaker's session id; `latest` by default. |

On Linux, install `speech-dispatcher` (`spd-say`) or `espeak-ng` if neither is there.

## With DuoWave: hear it in the room

A notification on your screen is easy to miss when you're in the kitchen. [DuoWave](https://duowave.ai) is a free,
open-source voice assistant that runs on your computer and connects to smart speakers at home. Give this server
DuoWave's address and an access key, and "Tests pass, ready for review" is said on the speaker in the room, or in
DuoWave's own voice on your computer.

1. Install DuoWave from [duowave.ai](https://duowave.ai).
2. In DuoWave, open **Settings → People and access → Access keys** and create a key for this server. Give it the right
   **Speak through the speaker**; for DuoWave's voice on the computer, also **Conversation, time, date**.
3. Set `DUOWAVE_URL` (for example `http://localhost:7780`) and `DUOWAVE_KEY`. In the Claude Code plugin, these are
   the plugin's options; the key is kept in Claude Code's secure storage.

If DuoWave can't be reached, the phrase is said with the system voice, and the tool's answer says why.

With DuoWave you can also go further: say a task out loud, DuoWave starts a Claude Code session, and tells you when
it's done.

## Privacy

Without `DUOWAVE_URL` and `DUOWAVE_KEY`, this server makes no network requests at all: it runs the speech program
your system already has. With them, it sends the phrase only to the DuoWave address you set. There is no telemetry.

## Troubleshooting

- **Nothing is said.** Run `npx -y speak-when-done say "test"` in a terminal. If that is silent, check your system
  volume and, on Linux, that `spd-say` or `espeak-ng` is installed.
- **The plugin hooks don't fire.** Type `/hooks` in Claude Code and check `Stop` and `Notification`.
- **Wrong language.** Set `SPEAK_LANGUAGE`, or a voice by name with `SPEAK_VOICE`. On macOS, more voices are in
  System Settings → Accessibility → Spoken Content → System Voice → Manage Voices.
- **Too chatty.** Set `SPEAK_QUIET=1` for a while, or disable the plugin with `/plugin`.

## Development

```
npm test
node bin/speak-when-done.js --help
```

## License

Apache-2.0. Made by the [DuoWave](https://duowave.ai) authors.
