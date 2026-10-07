import { describe, expect, it } from 'vitest';
import { icon } from './icons';

describe('icon', () => {
  it('maps names, passes emoji through, and falls back', () => {
    expect(icon('bucket')).toBe('🪣');
    expect(icon('🔥')).toBe('🔥');
    expect(icon('nope')).toBe('❔');
    expect(icon(undefined)).toBe('❔');
  });
});
