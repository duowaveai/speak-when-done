import assert from 'node:assert/strict';
import { test } from 'node:test';

import { macVoiceFor, parseMacVoices, plans, playWav, speakSystem, windowsEncodedScript } from '../src/system-voice.js';

const LISTING = `Albert              en_US    # Hello! My name is Albert.
Anna                de_DE    # Hallo! Ich heiße Anna.
Daniel              en_GB    # Hello! My name is Daniel.
Milena              ru_RU    # Здравствуйте! Меня зовут Милена.
Eddy (German (Germany)) de_DE    # Hallo! Ich heiße Eddy.
`;

test('macOS voices are parsed and matched by language', () => {
  const voices = parseMacVoices(LISTING);
  assert.equal(voices.length, 5);
  assert.equal(voices[4].name, 'Eddy (German (Germany))');
  assert.equal(macVoiceFor(voices, 'ru'), 'Milena');
  assert.equal(macVoiceFor(voices, 'en-GB'), 'Daniel');
  assert.equal(macVoiceFor(voices, 'en_us'), 'Albert');
  assert.equal(macVoiceFor(voices, 'ja'), undefined);
});

test('macOS plan: say with voice and rate, text never in args', () => {
  const [plan] = plans('darwin', { voice: 'Anna', rate: 1000 });
  assert.equal(plan.command, 'say');
  assert.deepEqual(plan.args, ['-v', 'Anna', '-r', '500']);
});

test('Windows plan: PowerShell SAPI with settings in env', () => {
  const [plan] = plans('win32', { language: 'de_de', rate: 225 });
  assert.equal(plan.command, 'powershell.exe');
  assert.ok(plan.args.includes('-EncodedCommand'));
  assert.deepEqual(plan.env, { SPEAK_WIN_LANG: 'de-DE', SPEAK_WIN_RATE: '2' });
  const script = Buffer.from(windowsEncodedScript(), 'base64').toString('utf16le');
  assert.match(script, /System\.Speech/);
  assert.match(script, /\[Console\]::In\.ReadToEnd\(\)/);
});

test('Linux plans: spd-say first, then espeak-ng, then espeak', () => {
  const list = plans('linux', { language: 'ru-RU' });
  assert.deepEqual(list.map((p) => p.command), ['spd-say', 'espeak-ng', 'espeak']);
  assert.deepEqual(list[0].args, ['-w', '-l', 'ru', '-e']);
  assert.deepEqual(list[1].args, ['-v', 'ru', '--stdin']);
});

test('speakSystem sends text on stdin and falls through missing programs', async () => {
  const calls = [];
  const run = async (command, args, { input }) => {
    calls.push({ command, args, input });
    if (command === 'spd-say') throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    return { code: 0, stderr: '' };
  };
  const done = await speakSystem('-rf hello', {}, { platform: 'linux', run });
  assert.equal(done.via, 'espeak-ng');
  assert.equal(calls[1].input, '-rf hello');
  assert.ok(!calls[1].args.includes('-rf hello'));
});

test('speakSystem on macOS picks a voice for the language', async () => {
  const calls = [];
  const done = await speakSystem(
    'Hallo',
    { language: 'de' },
    {
      platform: 'darwin',
      capture: async () => ({ code: 0, out: LISTING }),
      run: async (command, args) => {
        calls.push(args);
        return { code: 0 };
      },
    },
  );
  assert.equal(done.via, 'macOS say (Anna)');
  assert.deepEqual(calls[0], ['-v', 'Anna']);
});

test('speakSystem explains when nothing can speak', async () => {
  const run = async () => {
    throw Object.assign(new Error('no'), { code: 'ENOENT' });
  };
  await assert.rejects(speakSystem('hi', {}, { platform: 'linux', run }), /spd-say|espeak-ng/);
});

test('playWav uses afplay on macOS and the next player on Linux', async () => {
  const seen = [];
  const run = async (command) => {
    seen.push(command);
    if (command === 'paplay') throw Object.assign(new Error('no'), { code: 'ENOENT' });
    return { code: 0 };
  };
  assert.equal((await playWav('/tmp/a.wav', { platform: 'darwin', run })).via, 'afplay');
  assert.equal((await playWav('/tmp/a.wav', { platform: 'linux', run })).via, 'pw-play');
});
