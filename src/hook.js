// A hook that says the outcome out loud in one phrase.
// - Claude Code (Stop, SubagentStop, Notification) passes the event as JSON on stdin:
//   https://code.claude.com/docs/en/hooks
// - Codex's `notify` program gets the event as JSON in its last argument:
//   {"type": "agent-turn-complete", "last-assistant-message": "…"}

import { phrase } from './text.js';

/** What to say for one hook event, or '' for nothing. */
export function phraseForHook(event, { maxChars = 200, doneText = 'Done.' } = {}) {
  if (!event || typeof event !== 'object') return '';
  if (event.type === 'agent-turn-complete') {
    return phrase(event['last-assistant-message'] ?? '', { max: maxChars, sentences: 1 }) || doneText;
  }
  switch (event.hook_event_name) {
    case 'Stop':
    case 'SubagentStop': {
      if (event.stop_hook_active) return ''; // Claude is continuing because of another Stop hook
      return phrase(event.last_assistant_message ?? '', { max: maxChars, sentences: 1 }) || doneText;
    }
    case 'Notification':
      return phrase(event.message ?? event.title ?? '', { max: maxChars, sentences: 1 });
    default:
      return phrase(event.message ?? event.last_assistant_message ?? '', { max: maxChars, sentences: 1 });
  }
}

/** Reads all of stdin as text (empty if stdin is a terminal). */
export async function readStdin(input = process.stdin) {
  if (input.isTTY) return '';
  let text = '';
  input.setEncoding?.('utf8');
  for await (const chunk of input) text += chunk;
  return text;
}
