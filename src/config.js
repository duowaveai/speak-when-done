// Settings come from environment variables only. Nothing is read from disk, nothing is sent anywhere
// unless DUOWAVE_URL and DUOWAVE_KEY are set.
//
// Inside a Claude Code plugin, hooks receive the plugin's options as CLAUDE_PLUGIN_OPTION_<KEY>; those are read too.

const ALIASES = {
  duowaveUrl: ['DUOWAVE_URL', 'CLAUDE_PLUGIN_OPTION_DUOWAVE_URL'],
  duowaveKey: ['DUOWAVE_KEY', 'CLAUDE_PLUGIN_OPTION_DUOWAVE_KEY'],
  duowaveTarget: ['DUOWAVE_TARGET', 'CLAUDE_PLUGIN_OPTION_DUOWAVE_TARGET'],
  duowaveSpeaker: ['DUOWAVE_SPEAKER', 'CLAUDE_PLUGIN_OPTION_DUOWAVE_SPEAKER'],
  voice: ['SPEAK_VOICE', 'CLAUDE_PLUGIN_OPTION_VOICE'],
  language: ['SPEAK_LANGUAGE', 'CLAUDE_PLUGIN_OPTION_LANGUAGE'],
  rate: ['SPEAK_RATE', 'CLAUDE_PLUGIN_OPTION_RATE'],
  maxChars: ['SPEAK_MAX_CHARS', 'CLAUDE_PLUGIN_OPTION_MAX_CHARS'],
  doneTool: ['SPEAK_DONE_TOOL'],
  quiet: ['SPEAK_QUIET', 'CLAUDE_PLUGIN_OPTION_QUIET'],
};

/** A value that is really set: not empty and not an unexpanded `${…}` placeholder from a client config. */
function given(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text || /^\$\{[^}]*\}$/.test(text)) return undefined;
  return text;
}

function pick(env, names) {
  for (const name of names) {
    const value = given(env[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function flag(value, fallback) {
  if (value === undefined) return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

export function readConfig(env = process.env) {
  const raw = Object.fromEntries(Object.entries(ALIASES).map(([key, names]) => [key, pick(env, names)]));
  const target = (raw.duowaveTarget ?? 'auto').toLowerCase();
  const rate = raw.rate === undefined ? undefined : Number(raw.rate);
  const maxChars = Number(raw.maxChars ?? 300);
  return {
    duowave:
      raw.duowaveUrl && raw.duowaveKey
        ? {
            url: raw.duowaveUrl.replace(/\/+$/, ''),
            key: raw.duowaveKey,
            target: ['speaker', 'computer', 'auto'].includes(target) ? target : 'auto',
            speaker: raw.duowaveSpeaker ?? 'latest',
          }
        : null,
    voice: raw.voice,
    language: raw.language,
    rate: Number.isFinite(rate) ? rate : undefined,
    maxChars: Number.isFinite(maxChars) && maxChars >= 20 ? Math.min(maxChars, 1000) : 300,
    doneTool: flag(raw.doneTool, true),
    quiet: flag(raw.quiet, false),
  };
}
