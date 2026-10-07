import { Howl, Howler } from 'howler';
import type { Lang } from '../i18n';

const clips = new Map<string, Howl | null>();
let current: Howl | null = null;

/** Santali falls back to Hindi clips if a Santali recording is missing, as the plan's fallback says. */
const chain = (lang: Lang): Lang[] => (lang === 'sat' ? ['sat', 'hi'] : [lang]);

const load = (url: string): Promise<Howl | null> =>
  new Promise((resolve) => {
    if (clips.has(url)) return resolve(clips.get(url)!);
    const h = new Howl({
      src: [url],
      format: ['mp3'],
      html5: true, // streams from the SW cache; avoids decoding every clip up front
      onload: () => (clips.set(url, h), resolve(h)),
      onloaderror: () => (clips.set(url, null), resolve(null)),
    });
  });

/**
 * Browsers block sound until the user touches the page. Call this from a tap handler
 * (the Start button) so later clips, played from timers and game events, are allowed.
 */
export function unlockAudio(): void {
  void Howler.ctx?.resume?.();
}

/** Plays /audio/<lang>/<key>.mp3, resolving when it ends. A missing clip resolves silently. */
export async function playClip(lang: Lang, key: string): Promise<void> {
  current?.stop();
  for (const l of chain(lang)) {
    const howl = await load(`/audio/${l}/${key}.mp3`);
    if (!howl) continue;
    current = howl;
    return new Promise((resolve) => {
      howl.once('end', () => resolve());
      howl.once('stop', () => resolve());
      howl.once('playerror', () => resolve());
      howl.play();
    });
  }
}
