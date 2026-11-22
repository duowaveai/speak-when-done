// DuoWave (https://duowave.ai): a free, open-source voice assistant that runs on your computer.
// With an access key it says a phrase on a speaker in the room, or in its own voice on the computer.
//
// - Speaker:  POST {url}/api/v1/station/sessions/{speaker|latest}/say  {"text"}  → 201 {"outcome"}
//             the key needs the right "station.say".
// - Computer: POST {url}/api/v1/talk/speech  {"text"}  → audio/wav, played here
//             the key needs the right "use:chat".
// Header: Authorization: Bearer <key>. Keys are made in DuoWave: Settings → People and access → Access keys.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { playWav } from './system-voice.js';

export const SPEAKER_MAX = 1000;
export const COMPUTER_MAX = 600;

export class DuoWaveError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DuoWaveError';
    this.status = status;
  }
}

async function reason(response) {
  const body = await response.text().catch(() => '');
  try {
    const json = JSON.parse(body);
    return json.message ?? json.error ?? body;
  } catch {
    return body;
  }
}

function post(fetchImpl, config, path, text) {
  return fetchImpl(`${config.url}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20_000),
  });
}

/** Says `text` on a DuoWave speaker. Resolves `{ via, outcome }`. */
export async function sayOnSpeaker(text, config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const speaker = encodeURIComponent(config.speaker ?? 'latest');
  const response = await post(fetchImpl, config, `/api/v1/station/sessions/${speaker}/say`, text.slice(0, SPEAKER_MAX));
  if (!response.ok) {
    throw new DuoWaveError(`DuoWave speaker: ${response.status} ${await reason(response)}`.trim(), response.status);
  }
  const body = await response.json().catch(() => ({}));
  const outcome = body.outcome ?? 'spoken';
  if (outcome === 'failed') throw new DuoWaveError('DuoWave speaker: the phrase failed', 502);
  return { via: 'DuoWave speaker', outcome };
}

/** Says `text` in DuoWave's voice on this computer. Resolves `{ via }`. */
export async function sayOnComputer(text, config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const response = await post(fetchImpl, config, '/api/v1/talk/speech', text.slice(0, COMPUTER_MAX));
  if (!response.ok) {
    throw new DuoWaveError(`DuoWave voice: ${response.status} ${await reason(response)}`.trim(), response.status);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 44) throw new DuoWaveError('DuoWave voice: empty audio', 502);
  if (deps.play) {
    await deps.play(audio);
    return { via: 'DuoWave voice on this computer' };
  }
  const dir = await mkdtemp(join(tmpdir(), 'speak-when-done-'));
  const file = join(dir, 'phrase.wav');
  try {
    await writeFile(file, audio);
    await playWav(file, deps);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return { via: 'DuoWave voice on this computer' };
}

/**
 * The DuoWave part of the chain. `target`: `speaker`, `computer`, or `auto` (a speaker if one is connected,
 * otherwise DuoWave's voice on the computer).
 */
export async function speakDuoWave(text, config, deps = {}) {
  if (config.target === 'computer') return sayOnComputer(text, config, deps);
  if (config.target === 'speaker') return sayOnSpeaker(text, config, deps);
  try {
    return await sayOnSpeaker(text, config, deps);
  } catch (error) {
    // 404: no speaker connected; 400: the speaker is in a mode where DuoWave can't speak on it;
    // 403: the key may use the voice but not the speaker; 409: that voice can't speak there now.
    if (error instanceof DuoWaveError && [400, 403, 404, 409].includes(error.status)) {
      return sayOnComputer(text, config, deps);
    }
    throw error;
  }
}
