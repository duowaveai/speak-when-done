// A Model Context Protocol server over stdio: newline-delimited JSON-RPC 2.0, no dependencies.
// Tools: `speak` (say any short text out loud) and `notify_done` (say that the task is finished).

import { readFileSync } from 'node:fs';

import { speak as defaultSpeak } from './speak.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const VOICE_PROPERTIES = {
  voice: {
    type: 'string',
    description: 'System voice name, e.g. "Samantha" on macOS, "Microsoft Zira Desktop" on Windows. Optional.',
  },
  language: {
    type: 'string',
    description: 'Language of the text as a BCP 47 tag, e.g. "en-US", "de", "ru". Picks a matching system voice. Optional.',
  },
  rate: { type: 'number', description: 'Speaking rate in words per minute, about 175 is normal. Optional.' },
};

const SPEAK_TOOL = {
  name: 'speak',
  title: 'Speak out loud',
  description:
    'Say a short text out loud on this computer (or on a DuoWave speaker in the room, if configured). ' +
    'Use when the user asks you to say something aloud. Keep it to one or two sentences; Markdown is stripped.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'What to say. One or two sentences.' }, ...VOICE_PROPERTIES },
    required: ['text'],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

const DONE_TOOL = {
  name: 'notify_done',
  title: 'Say the task is done',
  description:
    'Tell the user out loud that you finished the task or need their input, so they can look away from the screen. ' +
    'Call it once, at the very end of a task, with one short sentence in the user’s language.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'One short sentence: what was done, or what you need. E.g. "Tests pass, the fix is ready for review."',
      },
      ...VOICE_PROPERTIES,
    },
    required: ['summary'],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

const INSTRUCTIONS =
  'This server speaks out loud for the user. When you finish a task or need the user’s decision, call ' +
  'notify_done once with one short sentence in the user’s language. Use speak only when asked to say something aloud.';

export function createServer(config, deps = {}) {
  const speak = deps.speak ?? defaultSpeak;
  const tools = config.doneTool ? [SPEAK_TOOL, DONE_TOOL] : [SPEAK_TOOL];
  let queue = Promise.resolve();

  /** One phrase at a time: two calls never talk over each other. */
  const say = (text, args) => {
    const next = queue.then(() =>
      speak(text, { voice: args.voice, language: args.language, rate: args.rate }, config, deps),
    );
    queue = next.catch(() => {});
    return next;
  };

  async function callTool(params) {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { error: { code: -32602, message: `Unknown tool: ${name}` } };
    const text = name === 'speak' ? args.text : args.summary;
    if (typeof text !== 'string' || !text.trim()) {
      const field = name === 'speak' ? 'text' : 'summary';
      return { result: { content: [{ type: 'text', text: `"${field}" is required.` }], isError: true } };
    }
    try {
      const done = await say(text, args);
      const line = done.spoken ? `Said "${done.spoken}" via ${done.via}.` : 'Nothing to say.';
      return { result: { content: [{ type: 'text', text: done.note ? `${line} (${done.note})` : line }] } };
    } catch (error) {
      return { result: { content: [{ type: 'text', text: `Could not speak: ${error.message}` }], isError: true } };
    }
  }

  /** Handles one JSON-RPC message; resolves the response object, or null for notifications. */
  async function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      if (message && typeof message === 'object' && 'id' in message && !('method' in message)) return null; // a response
      return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    }
    const { id, method, params } = message;
    const isNotification = id === undefined;
    let outcome;
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        outcome = {
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'speak-when-done', title: 'Speak When Done', version: VERSION },
            ...(config.doneTool ? { instructions: INSTRUCTIONS } : {}),
          },
        };
        break;
      }
      case 'ping':
        outcome = { result: {} };
        break;
      case 'tools/list':
        outcome = { result: { tools } };
        break;
      case 'tools/call':
        outcome = await callTool(params);
        break;
      default:
        if (method.startsWith('notifications/')) return null;
        outcome = { error: { code: -32601, message: `Method not found: ${method}` } };
    }
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, ...outcome };
  }

  return { handle, tools };
}

/** Reads newline-delimited JSON-RPC from `input`, writes responses to `output`. Logs go to stderr only. */
export function serveStdio(config, { input = process.stdin, output = process.stdout, deps } = {}) {
  const server = createServer(config, deps);
  let buffer = '';
  const pending = new Set();
  const send = (response) => {
    if (response) output.write(`${JSON.stringify(response)}\n`);
  };
  const process1 = (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const messages = Array.isArray(message) ? message : [message];
    for (const one of messages) {
      const job = server.handle(one).then(send, (error) =>
        send({ jsonrpc: '2.0', id: one?.id ?? null, error: { code: -32603, message: String(error?.message ?? error) } }),
      );
      pending.add(job);
      job.finally(() => pending.delete(job));
    }
  };
  input.setEncoding?.('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.trim()) process1(line);
    }
  });
  return new Promise((resolve) => {
    input.on('end', async () => {
      if (buffer.trim()) process1(buffer);
      await Promise.allSettled([...pending]);
      resolve();
    });
  });
}
