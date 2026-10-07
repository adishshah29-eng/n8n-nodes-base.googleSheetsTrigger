import qrcode from 'qrcode-generator';

/** Where the QR points. Set VITE_VERIFY_BASE_URL (e.g. https://aotan.arovat.com) to pin the public domain. */
export function verifyUrl(token: string, base = import.meta.env.VITE_VERIFY_BASE_URL || location.origin): string {
  return `${base.replace(/\/$/, '')}/v#${token}`;
}

/** Dark/light module grid for `text`. Error correction M balances density against glare and print wear. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M'); // type 0 = smallest version that fits
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x)));
}

export const QUIET_ZONE = 4; // modules; the QR spec minimum, scanners need it

/** SVG element drawn from the matrix (no HTML parsing). Always black on white so it scans at any theme. */
export function qrSvg(text: string): SVGSVGElement {
  const m = qrMatrix(text);
  const size = m.length + QUIET_ZONE * 2;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Certificate QR code');

  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(size));
  bg.setAttribute('height', String(size));
  bg.setAttribute('fill', '#fff');

  let d = '';
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }),
  );
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');

  svg.append(bg, path);
  return svg;
}
