// The chain: DuoWave if it is configured, otherwise (or if it fails) the computer's own voice.

import { speakDuoWave } from './duowave.js';
import { speakSystem } from './system-voice.js';
import { phrase } from './text.js';

/**
 * Says `text` out loud. `options`: `voice`, `language`, `rate` override the config for this phrase.
 * Resolves `{ spoken, via, note? }`; throws only when no voice at all could speak.
 */
export async function speak(text, options = {}, config, deps = {}) {
  const words = phrase(text, { max: options.maxChars ?? config.maxChars });
  if (!words) return { spoken: '', via: 'nothing to say' };
  if (config.quiet) return { spoken: words, via: 'muted (SPEAK_QUIET)' };
  const voiceOptions = {
    voice: options.voice ?? config.voice,
    language: options.language ?? config.language,
    rate: options.rate ?? config.rate,
  };
  let note;
  if (config.duowave) {
    try {
      const done = await (deps.speakDuoWave ?? speakDuoWave)(words, config.duowave, deps);
      return { spoken: words, via: done.via };
    } catch (error) {
      note = `${error.message}; used the system voice instead`;
    }
  }
  const done = await (deps.speakSystem ?? speakSystem)(words, voiceOptions, deps);
  return { spoken: words, via: done.via, ...(note ? { note } : {}) };
}
