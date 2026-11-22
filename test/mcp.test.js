import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

import { readConfig } from '../src/config.js';
import { createServer, PROTOCOL_VERSIONS, VERSION } from '../src/mcp.js';

const BIN = new URL('../bin/speak-when-done.js', import.meta.url).pathname;

test('initialize negotiates the protocol version and lists capabilities', async () => {
  const server = createServer(readConfig({}));
  const res = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(res.result.protocolVersion, '2025-06-18');
  assert.deepEqual(res.result.capabilities, { tools: { listChanged: false } });
  assert.equal(res.result.serverInfo.version, VERSION);
  const unknown = await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(unknown.result.protocolVersion, PROTOCOL_VERSIONS[0]);
});

test('tools/list has speak and notify_done; SPEAK_DONE_TOOL=off leaves only speak', async () => {
  const both = await createServer(readConfig({})).handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(both.result.tools.map((t) => t.name), ['speak', 'notify_done']);
  const one = await createServer(readConfig({ SPEAK_DONE_TOOL: 'off' })).handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(one.result.tools.map((t) => t.name), ['speak']);
});

test('tools/call speaks and reports how', async () => {
  const said = [];
  const server = createServer(readConfig({}), {
    speak: async (text, options) => {
      said.push([text, options.language]);
      return { spoken: text, via: 'test voice' };
    },
  });
  const res = await server.handle({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'notify_done', arguments: { summary: 'Done.', language: 'en' } },
  });
  assert.deepEqual(res, { jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'Said "Done." via test voice.' }] } });
  assert.deepEqual(said, [['Done.', 'en']]);
});

test('bad calls: missing text is a tool error, unknown method a JSON-RPC error, notifications get no reply', async () => {
  const server = createServer(readConfig({}));
  const missing = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'speak', arguments: {} } });
  assert.equal(missing.result.isError, true);
  const unknown = await server.handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
  assert.equal(unknown.error.code, -32601);
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('phrases never overlap: the second waits for the first', async () => {
  const log = [];
  const server = createServer(readConfig({}), {
    speak: async (text) => {
      log.push(`start ${text}`);
      await new Promise((r) => setTimeout(r, text === 'one' ? 50 : 1));
      log.push(`end ${text}`);
      return { spoken: text, via: 'x' };
    },
  });
  const call = (text) => server.handle({ jsonrpc: '2.0', id: text, method: 'tools/call', params: { name: 'speak', arguments: { text } } });
  await Promise.all([call('one'), call('two')]);
  assert.deepEqual(log, ['start one', 'end one', 'start two', 'end two']);
});

test('stdio: a real client session over the binary', async () => {
  const child = spawn(process.execPath, [BIN], { env: { ...process.env, SPEAK_QUIET: '1', DUOWAVE_URL: '', DUOWAVE_KEY: '' } });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'speak', arguments: { text: '**Hello** world' } } },
  ];
  child.stdin.end(`${messages.map((m) => JSON.stringify(m)).join('\n')}\nnot json\n`);
  await new Promise((resolve) => child.on('close', resolve));
  const replies = out.trim().split('\n').map((line) => JSON.parse(line));
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]));
  assert.equal(byId[1].result.serverInfo.name, 'speak-when-done');
  assert.equal(byId[2].result.tools.length, 2);
  assert.equal(byId[3].result.content[0].text, 'Said "Hello world" via muted (SPEAK_QUIET).');
  assert.equal(byId.null.error.code, -32700);
});
