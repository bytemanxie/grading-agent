/**
 * Image Crop Service
 * 图片裁剪服务
 */

import sharp from 'sharp';

import type { QuestionRegion } from '../common/types/region.js';

/**
 * Check if a string is a URL
 */
function isUrl(path: string): boolean {
  try {
    const url = new URL(path);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Download image from URL to buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Crop image region based on percentage coordinates
 * 根据百分比坐标裁剪图片区域
 *
 * @param imagePath Image path (local file path or URL)
 * @param region Region with percentage coordinates
 * @param expandPercent Expand percentage for each direction (default: 2%)
 * @returns Cropped image buffer
 */
export async function cropRegion(
  imagePath: string,
  region: QuestionRegion,
  expandPercent: number = 2,
): Promise<Buffer> {
  let imageBuffer: Buffer;

  // Handle URL vs local file path
  if (isUrl(imagePath)) {
    // Download image from URL
    imageBuffer = await downloadImage(imagePath);
  } else {
    // Read local file
    const fs = await import('fs/promises');
    imageBuffer = await fs.readFile(imagePath);
  }

  // Load image from buffer
  const image = sharp(imageBuffer);

  // Get image metadata
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error('Failed to get image dimensions');
  }

  // Expand region by expandPercent on each side
  const expandedXMin = Math.max(0, region.x_min_percent - expandPercent);
  const expandedYMin = Math.max(0, region.y_min_percent - expandPercent);
  const expandedXMax = Math.min(100, region.x_max_percent + expandPercent);
  const expandedYMax = Math.min(100, region.y_max_percent + expandPercent);

  // Calculate actual pixel coordinates from percentage
  const left = Math.round((expandedXMin / 100) * width);
  const top = Math.round((expandedYMin / 100) * height);
  const cropWidth = Math.round(((expandedXMax - expandedXMin) / 100) * width);
  const cropHeight = Math.round(((expandedYMax - expandedYMin) / 100) * height);

  // Validate crop dimensions
  if (cropWidth <= 0 || cropHeight <= 0) {
    throw new Error(
      `Invalid crop dimensions: width=${cropWidth}, height=${cropHeight}`,
    );
  }

  if (left + cropWidth > width || top + cropHeight > height) {
    throw new Error(
      `Crop region exceeds image boundaries: image=${width}x${height}, crop=${left},${top},${cropWidth}x${cropHeight}`,
    );
  }

  // Extract and return cropped image buffer
  const cropped = await image
    .extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    })
    .toBuffer();

  return cropped;
}
