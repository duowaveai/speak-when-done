// The computer's own voice: macOS `say`, Windows SAPI through PowerShell, Linux `spd-say` or `espeak-ng`/`espeak`.
// The text always goes through stdin, never through a shell or a command-line argument.

import { capture as defaultCapture, run as defaultRun } from './run.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));

/** `ru`, `ru-RU`, `ru_ru` → `{ lang: 'ru', locale: 'ru_RU' }`. */
export function parseLanguage(language) {
  if (!language) return null;
  const [lang, region] = String(language).trim().replace(/-/g, '_').split('_');
  if (!lang) return null;
  return { lang: lang.toLowerCase(), locale: region ? `${lang.toLowerCase()}_${region.toUpperCase()}` : null };
}

/** Lines of `say -v '?'` → `[{ name, locale }]`. */
export function parseMacVoices(listing) {
  const voices = [];
  for (const line of String(listing).split('\n')) {
    const match = line.match(/^(.+?)\s+([a-z]{2,3}_[A-Za-z0-9]+)\s+#/);
    if (match) voices.push({ name: match[1].trim(), locale: match[2] });
  }
  return voices;
}

/** The first macOS voice for a language: the exact locale first, then any region of it. */
export function macVoiceFor(voices, language) {
  const wanted = parseLanguage(language);
  if (!wanted) return undefined;
  const exact = wanted.locale && voices.find((voice) => voice.locale === wanted.locale);
  if (exact) return exact.name;
  return voices.find((voice) => voice.locale.toLowerCase().startsWith(`${wanted.lang}_`))?.name;
}

const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($env:SPEAK_WIN_VOICE) { $s.SelectVoice($env:SPEAK_WIN_VOICE) }
elseif ($env:SPEAK_WIN_LANG) {
  $v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like "$($env:SPEAK_WIN_LANG)*" } | Select-Object -First 1
  if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
}
if ($env:SPEAK_WIN_RATE) { $s.Rate = [int]$env:SPEAK_WIN_RATE }
$s.Speak([Console]::In.ReadToEnd())
`;

/** PowerShell's -EncodedCommand: base64 of UTF-16LE. */
export const windowsEncodedScript = () => Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64');

/**
 * The commands to try, in order, for one platform. `rate` is words per minute (macOS `say -r` scale, ~175 normal).
 * Returns `[{ name, command, args, env? }]`.
 */
export function plans(platform, { voice, language, rate } = {}) {
  const wanted = parseLanguage(language);
  if (platform === 'darwin') {
    const args = [];
    if (voice) args.push('-v', voice);
    if (rate) args.push('-r', String(clamp(rate, 80, 500)));
    return [{ name: 'macOS say', command: 'say', args }];
  }
  if (platform === 'win32') {
    const env = {};
    if (voice) env.SPEAK_WIN_VOICE = voice;
    if (wanted) env.SPEAK_WIN_LANG = wanted.locale ? wanted.locale.replace('_', '-') : wanted.lang;
    if (rate) env.SPEAK_WIN_RATE = String(clamp((rate - 175) / 25, -10, 10));
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', windowsEncodedScript()];
    return [
      { name: 'Windows speech (SAPI)', command: 'powershell.exe', args, env },
      { name: 'Windows speech (SAPI)', command: 'pwsh', args, env },
    ];
  }
  // Linux and other Unix systems.
  const spd = ['-w'];
  if (wanted) spd.push('-l', wanted.lang);
  if (voice) spd.push('-y', voice);
  if (rate) spd.push('-r', String(clamp((rate - 175) / 1.75, -100, 100)));
  spd.push('-e');
  const espeak = ['-v', voice ?? wanted?.lang ?? 'en'];
  if (rate) espeak.push('-s', String(clamp(rate, 80, 450)));
  espeak.push('--stdin');
  return [
    { name: 'spd-say', command: 'spd-say', args: spd },
    { name: 'espeak-ng', command: 'espeak-ng', args: espeak },
    { name: 'espeak', command: 'espeak', args: espeak },
  ];
}

/**
 * Says `text` with the system voice. Resolves `{ via }` or throws with a readable message.
 * `deps` lets tests replace the platform and the process runner.
 */
export async function speakSystem(text, options = {}, deps = {}) {
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? defaultRun;
  const capture = deps.capture ?? defaultCapture;
  let { voice } = options;
  if (platform === 'darwin' && !voice && options.language) {
    try {
      const { out } = await capture('say', ['-v', '?']);
      voice = macVoiceFor(parseMacVoices(out), options.language);
    } catch {
      // No voice list: speak with the default voice.
    }
  }
  const tried = [];
  for (const plan of plans(platform, { ...options, voice })) {
    try {
      const { code, stderr } = await run(plan.command, plan.args, { input: text, env: plan.env });
      if (code === 0) return { via: voice ? `${plan.name} (${voice})` : plan.name };
      tried.push(`${plan.name} exited with ${code}${stderr ? `: ${stderr.slice(0, 200)}` : ''}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') tried.push(`${plan.name}: ${error.message}`);
    }
  }
  const hint =
    platform === 'linux' || !['darwin', 'win32'].includes(platform)
      ? ' Install speech-dispatcher (spd-say) or espeak-ng.'
      : '';
  throw new Error(`No system voice worked.${tried.length ? ` ${tried.join('; ')}.` : ''}${hint}`);
}

/** Plays a WAV file: afplay on macOS, PowerShell SoundPlayer on Windows, paplay/aplay/pw-play on Linux. */
export async function playWav(file, deps = {}) {
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? defaultRun;
  const candidates =
    platform === 'darwin'
      ? [['afplay', [file]]]
      : platform === 'win32'
        ? [
            [
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                '(New-Object System.Media.SoundPlayer $env:SPEAK_WAV).PlaySync()',
              ],
            ],
          ]
        : [
            ['paplay', [file]],
            ['pw-play', [file]],
            ['aplay', ['-q', file]],
          ];
  for (const [command, args] of candidates) {
    try {
      const { code } = await run(command, args, { env: { SPEAK_WAV: file } });
      if (code === 0) return { via: command };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('No audio player found to play the DuoWave voice.');
}
