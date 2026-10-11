import { PNG } from 'pngjs';

const LIGHT_LUMA_FLOOR = 248;
const DARK_LUMA_CEILING = 24;
const CHANNEL_DEVIATION = 8;
const MAX_OUTLIER_FRACTION = 0.00001;

/**
 * Detect only captures whose visible pixels prove an effectively unpainted light or dark canvas.
 * This is deliberately not a visual-quality score: non-extreme grounds and any coherent contrasting
 * pixels are admitted for review, while a minute amount of raster noise cannot make a blank capture
 * look populated.
 */
export function isNearUniformBlankCapture(bytes: Buffer): boolean {
  const image = PNG.sync.read(bytes);
  const total = image.width * image.height;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * 4;
    red += image.data[offset]!;
    green += image.data[offset + 1]!;
    blue += image.data[offset + 2]!;
  }
  const mean = [red / total, green / total, blue / total] as const;
  const luma = (mean[0] * 2126 + mean[1] * 7152 + mean[2] * 722) / 10_000;
  if (luma > DARK_LUMA_CEILING && luma < LIGHT_LUMA_FLOOR) return false;

  const allowedOutliers = Math.max(1, Math.floor(total * MAX_OUTLIER_FRACTION));
  let outliers = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * 4;
    if (Math.abs(image.data[offset]! - mean[0]) > CHANNEL_DEVIATION
      || Math.abs(image.data[offset + 1]! - mean[1]) > CHANNEL_DEVIATION
      || Math.abs(image.data[offset + 2]! - mean[2]) > CHANNEL_DEVIATION) {
      outliers += 1;
      if (outliers > allowedOutliers) return false;
    }
  }
  return true;
}
