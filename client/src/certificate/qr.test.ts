import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { QUIET_ZONE, qrMatrix, verifyUrl } from './qr';

// A realistic token: 233 chars, same shape the server issues
const token = 'x'.repeat(150) + '.' + 'y'.repeat(86);

const decode = (text: string, scale = 6): string | undefined => {
  const m = qrMatrix(text);
  const size = (m.length + QUIET_ZONE * 2) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  m.forEach((row, my) =>
    row.forEach((dark, mx) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((my + QUIET_ZONE) * scale + y) * size + (mx + QUIET_ZONE) * scale + x) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }),
  );
  return jsQR(px, size, size)?.data;
};

describe('certificate QR', () => {
  it('builds the verify URL with the token in the fragment', () => {
    expect(verifyUrl(token, 'https://aotan.arovat.com/')).toBe(`https://aotan.arovat.com/v#${token}`);
  });

  it('encodes a full verify URL that a scanner decodes back exactly', () => {
    const url = verifyUrl(token, 'https://aotan.arovat.com');
    expect(decode(url)).toBe(url);
  });

  it('stays a modest size for a real token', () => {
    expect(qrMatrix(verifyUrl(token, 'https://aotan.arovat.com')).length).toBeLessThanOrEqual(73); // version 12
  });
});
