// Turns an agent's message into one short phrase that sounds right out loud.

/** Strips Markdown that a voice would read literally: code, links, emphasis, headings, tables. */
export function plain(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code keeps its words
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links keep their text
    .replace(/https?:\/\/\S+/g, ' ') // bare URLs
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, ' ') // headings: a title, not a sentence
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/^\s*\d+[.)]\s+/gm, '') // numbered lists
    .replace(/^\s*>\s?/gm, '') // quotes
    .replace(/\|/g, ' ') // table pipes
    .replace(/(\*\*|\*|~~)(?=\S)([^*~]*?\S)\1/g, '$2') // emphasis with stars or tildes
    .replace(/(^|[\s(])(__|_)(?=\S)([^_]*?\S)\2(?=[\s).,!?:;]|$)/gm, '$1$3') // _emphasis_, not snake_case
    .replace(/[*#>~]+/g, ' ')
    .replace(/([^\s.!?:;,…])[ \t]*\n+/g, '$1. ') // a line without an ending is still a sentence
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One phrase of at most `max` characters: whole sentences while they fit, otherwise the first words with "…".
 * `sentences` limits how many sentences are kept (0 = as many as fit).
 */
export function phrase(text, { max = 300, sentences = 0 } = {}) {
  const clean = plain(text);
  if (!clean) return '';
  const parts = clean.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [clean];
  let out = '';
  let count = 0;
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const next = out ? `${out} ${part}` : part;
    if (next.length > max) break;
    out = next;
    count += 1;
    if (sentences && count >= sentences) break;
  }
  if (out) return out;
  // The first sentence alone is too long: cut at a word boundary.
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, '')}…`;
}
