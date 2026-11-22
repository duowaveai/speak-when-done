import assert from 'node:assert/strict';
import { test } from 'node:test';

import { phrase, plain } from '../src/text.js';

test('plain strips Markdown a voice would read literally', () => {
  const md = '## Summary\n\nFixed the **race** in `refresh_token` — see [the PR](https://x.y/1).\n\n```js\nconst a = 1;\n```';
  assert.equal(plain(md), 'Fixed the race in refresh_token — see the PR.');
});

test('plain keeps snake_case and turns list lines into sentences', () => {
  assert.equal(plain('Changes:\n- renamed last_assistant_message\n- added _tests_'), 'Changes: renamed last_assistant_message. added tests');
});

test('phrase keeps whole sentences that fit', () => {
  assert.equal(phrase('All tests pass. I also updated the docs. Next I would refactor.', { max: 45 }), 'All tests pass. I also updated the docs.');
  assert.equal(phrase('One. Two. Three.', { sentences: 1 }), 'One.');
});

test('phrase cuts a long sentence at a word boundary', () => {
  const out = phrase('word '.repeat(100), { max: 40 });
  assert.ok(out.length <= 40, out);
  assert.ok(out.endsWith('…'));
});

test('phrase handles non-Latin text and empty input', () => {
  assert.equal(phrase('Готово. Тесты проходят.', { sentences: 1 }), 'Готово.');
  assert.equal(phrase('完成了。测试通过。', { sentences: 1 }), '完成了。');
  assert.equal(phrase(''), '');
  assert.equal(phrase(undefined), '');
});
