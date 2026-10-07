export type Tier = 'high' | 'low';

/**
 * Rough device class from cores and memory. A ₹10k Android phone is usually 'low': smaller shadow map,
 * 640x480 camera (MindAR's tracking cost grows with camera resolution). `?quality=low|high` overrides.
 */
export function deviceTier(): Tier {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'low' || forced === 'high') return forced;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return cores >= 8 && memory >= 4 ? 'high' : 'low';
}
