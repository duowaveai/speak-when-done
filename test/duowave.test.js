import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { speakDuoWave } from '../src/duowave.js';
import { speak } from '../src/speak.js';
import { readConfig } from '../src/config.js';

/** A stand-in for the DuoWave gateway: records requests, answers as the real routes do. */
async function fakeGateway({ speaker = 201, speech = 200 } = {}) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
      if (req.url.startsWith('/api/v1/station/sessions/')) {
        res.writeHead(speaker, { 'content-type': 'application/json' });
        res.end(JSON.stringify(speaker === 201 ? { outcome: 'spoken' } : { message: 'no live station session with credentials' }));
      } else if (req.url === '/api/v1/talk/speech') {
        res.writeHead(speech, { 'content-type': speech === 200 ? 'audio/wav' : 'application/json' });
        res.end(speech === 200 ? Buffer.alloc(100) : JSON.stringify({ message: 'Голос ещё запускается' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('speaker: POST /api/v1/station/sessions/latest/say with a Bearer key', async () => {
  const gw = await fakeGateway();
  try {
    const done = await speakDuoWave('Tests pass.', { url: gw.url, key: 'vgw_test', target: 'speaker', speaker: 'latest' });
    assert.equal(done.via, 'DuoWave speaker');
    assert.deepEqual(gw.seen, [
      { method: 'POST', url: '/api/v1/station/sessions/latest/say', auth: 'Bearer vgw_test', body: { text: 'Tests pass.' } },
    ]);
  } finally {
    await gw.close();
  }
});

test('auto: no speaker (404) → DuoWave voice on this computer', async () => {
  const gw = await fakeGateway({ speaker: 404 });
  const played = [];
  try {
    const done = await speakDuoWave(
      'Ready.',
      { url: gw.url, key: 'k', target: 'auto', speaker: 'latest' },
      { play: async (audio) => played.push(audio.length) },
    );
    assert.equal(done.via, 'DuoWave voice on this computer');
    assert.deepEqual(gw.seen.map((r) => r.url), ['/api/v1/station/sessions/latest/say', '/api/v1/talk/speech']);
    assert.deepEqual(played, [100]);
  } finally {
    await gw.close();
  }
});

test('long text is cut to what each route accepts', async () => {
  const gw = await fakeGateway();
  try {
    await speakDuoWave('a'.repeat(2000), { url: gw.url, key: 'k', target: 'speaker' });
    await speakDuoWave('b'.repeat(2000), { url: gw.url, key: 'k', target: 'computer' }, { play: async () => {} });
    assert.equal(gw.seen[0].body.text.length, 1000);
    assert.equal(gw.seen[1].body.text.length, 600);
  } finally {
    await gw.close();
  }
});

test('the chain falls back to the system voice when DuoWave fails, and says why', async () => {
  const gw = await fakeGateway({ speaker: 404, speech: 409 });
  try {
    const config = readConfig({ DUOWAVE_URL: gw.url, DUOWAVE_KEY: 'k' });
    const done = await speak('Build finished.', {}, config, {
      play: async () => {},
      speakSystem: async () => ({ via: 'macOS say' }),
    });
    assert.equal(done.via, 'macOS say');
    assert.match(done.note, /409/);
  } finally {
    await gw.close();
  }
});

test('without DuoWave nothing goes to the network', async () => {
  const config = readConfig({});
  const done = await speak('Hi', {}, config, {
    fetch: () => assert.fail('no network expected'),
    speakSystem: async (text, opts) => ({ via: `system:${text}:${opts.language ?? ''}` }),
  });
  assert.equal(done.via, 'system:Hi:');
});
