// Choice cards lean on big pictures: many workers read little. Emoji need no asset downloads
// and work offline; unknown names fall back to a neutral symbol.
const ICONS: Record<string, string> = {
  bucket: '🪣', run: '🏃', alarm: '🚨', hand: '✋', kick: '🦶', stop: '🛑', lock: '🔒',
  person: '🧍', thumbsup: '👍', test: '🔍', fire: '🔥',
};

/** A known icon name, or a literal emoji passed through as-is. */
export const icon = (name: string | undefined): string => {
  if (!name) return '❔';
  return ICONS[name] ?? (/^[a-z]+$/i.test(name) ? '❔' : name);
};
