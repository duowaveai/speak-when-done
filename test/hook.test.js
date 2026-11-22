import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { phraseForHook } from '../src/hook.js';

const BIN = new URL('../bin/speak-when-done.js', import.meta.url).pathname;

test('Stop: the first sentence of the last message', () => {
  const event = {
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: '## Done\n\nAll 42 tests pass and the **fix** is committed. Details below.',
  };
  assert.equal(phraseForHook(event), 'All 42 tests pass and the fix is committed.');
});

test('Stop: nothing while another Stop hook keeps Claude going; "Done." when there is no message', () => {
  assert.equal(phraseForHook({ hook_event_name: 'Stop', stop_hook_active: true, last_assistant_message: 'x' }), '');
  assert.equal(phraseForHook({ hook_event_name: 'Stop' }), 'Done.');
});

test('Notification: the message itself', () => {
  const event = { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' };
  assert.equal(phraseForHook(event), 'Claude needs your permission to use Bash');
});

test('Codex notify: agent-turn-complete', () => {
  const event = { type: 'agent-turn-complete', 'last-assistant-message': 'Rename complete and verified `cargo build` succeeds.' };
  assert.equal(phraseForHook(event), 'Rename complete and verified cargo build succeeds.');
});

test('Codex passes the event as an argument', () => {
  const run = spawnSync(process.execPath, [BIN, 'hook', JSON.stringify({ type: 'agent-turn-complete', 'last-assistant-message': 'Ok.' })], {
    env: { ...process.env, SPEAK_QUIET: '1' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
});

test('the hook command never fails, even on broken input', () => {
  const env = { ...process.env, SPEAK_QUIET: '1' };
  const bad = spawnSync(process.execPath, [BIN, 'hook'], { input: '{not json', env, encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.match(bad.stderr, /speak-when-done:/);
  const good = spawnSync(process.execPath, [BIN, 'hook'], {
    input: JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: 'Ready.' }),
    env,
    encoding: 'utf8',
  });
  assert.equal(good.status, 0);
  assert.equal(good.stderr, '');
});
