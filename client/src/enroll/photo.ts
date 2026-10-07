const MAX_SIDE = 320;

/**
 * Downscales a camera photo to a small JPEG data URL (~20 KB). Enrollment uploads it as JSON
 * and the verify page shows it, so a 4 MB original would be wasteful and rejected by the server.
 */
export async function photoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}
