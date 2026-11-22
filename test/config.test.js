import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readConfig } from '../src/config.js';

test('no DuoWave without both URL and key', () => {
  assert.equal(readConfig({}).duowave, null);
  assert.equal(readConfig({ DUOWAVE_URL: 'http://localhost:7780' }).duowave, null);
});

test('DuoWave settings, trailing slash removed, defaults', () => {
  const config = readConfig({ DUOWAVE_URL: 'http://localhost:7780/', DUOWAVE_KEY: 'k' });
  assert.deepEqual(config.duowave, { url: 'http://localhost:7780', key: 'k', target: 'auto', speaker: 'latest' });
  assert.equal(config.maxChars, 300);
  assert.equal(config.doneTool, true);
  assert.equal(config.quiet, false);
});

test('unexpanded ${…} placeholders and empty values count as unset', () => {
  const config = readConfig({ DUOWAVE_URL: '${user_config.duowave_url}', DUOWAVE_KEY: '', SPEAK_VOICE: '  ' });
  assert.equal(config.duowave, null);
  assert.equal(config.voice, undefined);
});

test('Claude Code plugin options are read', () => {
  const config = readConfig({
    CLAUDE_PLUGIN_OPTION_DUOWAVE_URL: 'http://pc:7780',
    CLAUDE_PLUGIN_OPTION_DUOWAVE_KEY: 'k',
    CLAUDE_PLUGIN_OPTION_DUOWAVE_TARGET: 'Computer',
    CLAUDE_PLUGIN_OPTION_LANGUAGE: 'de',
  });
  assert.equal(config.duowave.target, 'computer');
  assert.equal(config.language, 'de');
});

test('flags and numbers', () => {
  const config = readConfig({ SPEAK_DONE_TOOL: 'off', SPEAK_QUIET: '1', SPEAK_RATE: '200', SPEAK_MAX_CHARS: '5' });
  assert.equal(config.doneTool, false);
  assert.equal(config.quiet, true);
  assert.equal(config.rate, 200);
  assert.equal(config.maxChars, 300, 'too small a limit falls back to the default');
});
