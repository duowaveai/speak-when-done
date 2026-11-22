#!/usr/bin/env node
// speak-when-done — voice notifications for AI coding agents.
//
//   speak-when-done                 run the MCP server on stdio (what MCP clients start)
//   speak-when-done say "text"      say a phrase now (or pipe text on stdin)
//   speak-when-done hook            for Claude Code hooks: read the event JSON on stdin, say the outcome
//   speak-when-done hook '<json>'   for Codex `notify`: the event JSON is the last argument

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readConfig } from '../src/config.js';
import { phraseForHook, readStdin } from '../src/hook.js';
import { serveStdio, VERSION } from '../src/mcp.js';
import { speak } from '../src/speak.js';

const HELP = `speak-when-done ${VERSION} — says out loud when your AI agent is done.

Usage:
  speak-when-done                      MCP server on stdio (tools: speak, notify_done)
  speak-when-done say [options] text   say a phrase now; reads stdin if no text
  speak-when-done hook                 Claude Code hook: event JSON on stdin
  speak-when-done hook '<json>'        Codex notify: event JSON as the argument

Options for "say":
  --voice NAME       system voice (macOS: say -v '?' lists them)
  --language TAG     e.g. en-US, de, ru — picks a matching system voice
  --rate WPM         words per minute, about 175 is normal

Environment:
  SPEAK_VOICE, SPEAK_LANGUAGE, SPEAK_RATE, SPEAK_MAX_CHARS (default 300), SPEAK_QUIET=1
  SPEAK_HOOK_WAIT=1            "hook" speaks before it exits instead of in a detached process
  DUOWAVE_URL, DUOWAVE_KEY     speak through DuoWave (https://duowave.ai) instead of the system voice
  DUOWAVE_TARGET               auto (default) | speaker | computer
  DUOWAVE_SPEAKER              speaker session id (default: latest)

Without DUOWAVE_URL and DUOWAVE_KEY nothing leaves this computer.`;

function parseSayArgs(args) {
  const options = {};
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--voice') options.voice = args[++i];
    else if (arg === '--language' || arg === '--lang') options.language = args[++i];
    else if (arg === '--rate') options.rate = Number(args[++i]);
    else if (arg === '--') {
      words.push(...args.slice(i + 1));
      break;
    } else words.push(arg);
  }
  return { options, text: words.join(' ') };
}

async function main(argv) {
  const [command, ...rest] = argv;
  const config = readConfig();
  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (command === undefined || command === 'serve' || command === 'mcp') {
    await serveStdio(config);
    return 0;
  }
  if (command === 'say') {
    const { options, text } = parseSayArgs(rest);
    const words = text || (await readStdin());
    const done = await speak(words, options, config);
    process.stderr.write(
      done.spoken ? `Said via ${done.via}${done.note ? ` (${done.note})` : ''}.\n` : 'Nothing to say.\n',
    );
    return 0;
  }
  if (command === 'hook') {
    // A hook must never break the agent: every problem ends with exit code 0 and a line on stderr.
    try {
      // Codex `notify` passes the JSON as an argument; Claude Code hooks pass it on stdin.
      const raw = rest.length ? rest[rest.length - 1] : await readStdin();
      const event = raw.trim() ? JSON.parse(raw) : {};
      const words = phraseForHook(event, { maxChars: config.maxChars });
      if (!words || config.quiet) return 0;
      if (process.env.SPEAK_HOOK_WAIT === '1') {
        await speak(words, {}, config);
      } else {
        // Answer the agent at once and speak in a detached process: the agent never waits for the voice,
        // and the voice is not cut off when the agent exits (as `claude -p` does).
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'say', '--', words], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.on('error', () => {});
        child.unref();
      }
    } catch (error) {
      process.stderr.write(`speak-when-done: ${error.message}\n`);
    }
    return 0;
  }
  process.stderr.write(`Unknown command: ${command}\n\n${HELP}\n`);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`speak-when-done: ${error.message}\n`);
    process.exitCode = 1;
  },
);
