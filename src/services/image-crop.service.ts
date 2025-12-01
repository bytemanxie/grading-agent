/**
 * Image Crop Service
 * 图片裁剪服务
 */

import { promises as fs } from 'fs';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { MAX_IMAGE_SIZE } from '../common/constants';
import type { QuestionRegion } from '../types/region';

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
 * Download image from URL to buffer with size validation
 */
async function downloadImage(url: string, logger: Logger): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`,
    );
  }

  // Check Content-Length header if available
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_IMAGE_SIZE) {
      logger.warn(
        `Image size exceeds limit: ${size} bytes (max: ${MAX_IMAGE_SIZE} bytes)`,
      );
      throw new BadRequestException(
        `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(size / 1024 / 1024).toFixed(2)}MB`,
      );
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate buffer size (in case Content-Length was not provided or incorrect)
  if (buffer.length > MAX_IMAGE_SIZE) {
    logger.warn(
      `Image buffer size exceeds limit: ${buffer.length} bytes (max: ${MAX_IMAGE_SIZE} bytes)`,
    );
    throw new BadRequestException(
      `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`,
    );
  }

  return buffer;
}

@Injectable()
export class ImageCropService {
  private readonly logger = new Logger(ImageCropService.name);

  /**
   * Crop image region based on percentage coordinates
   * 根据百分比坐标裁剪图片区域
   *
   * @param imagePath Image path (local file path or URL)
   * @param region Region with percentage coordinates
   * @param expandPercent Expand percentage for each direction (default: 2%)
   * @returns Cropped image buffer
   */
  async cropRegion(
    imagePath: string,
    region: QuestionRegion,
    expandPercent: number = 2,
  ): Promise<Buffer> {
    let imageBuffer: Buffer;

    // Handle URL vs local file path
    if (isUrl(imagePath)) {
      // Download image from URL
      this.logger.debug('Downloading image from URL', { imagePath });
      imageBuffer = await downloadImage(imagePath, this.logger);
    } else {
      // Read local file
      this.logger.debug('Reading local file', { imagePath });
      imageBuffer = await fs.readFile(imagePath);

      // Validate local file size
      if (imageBuffer.length > MAX_IMAGE_SIZE) {
        this.logger.warn(
          `Local image size exceeds limit: ${imageBuffer.length} bytes (max: ${MAX_IMAGE_SIZE} bytes)`,
        );
        throw new BadRequestException(
          `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB`,
        );
      }
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
    const cropHeight = Math.round(
      ((expandedYMax - expandedYMin) / 100) * height,
    );

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

    this.logger.debug('Image cropped successfully', {
      originalSize: `${width}x${height}`,
      cropSize: `${cropWidth}x${cropHeight}`,
      cropPosition: `${left},${top}`,
    });

    return cropped;
  }
}
