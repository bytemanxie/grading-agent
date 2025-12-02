/**
 * Image Validator Service
 * 负责验证图片相关属性
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { MAX_IMAGE_SIZE } from '../../common/constants';

@Injectable()
export class ImageValidatorService {
  private readonly logger = new Logger(ImageValidatorService.name);

  /**
   * Validate image size
   * 验证图片大小
   */
  async validateImageSize(imageUrl: string): Promise<void> {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (!response.ok) {
        // If HEAD request fails, try GET with range to check size
        const getResponse = await fetch(imageUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
        });
        const contentLength = getResponse.headers.get('content-length');
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (size > MAX_IMAGE_SIZE) {
            throw new BadRequestException(
              `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(size / 1024 / 1024).toFixed(2)}MB`,
            );
          }
        }
      } else {
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (size > MAX_IMAGE_SIZE) {
            throw new BadRequestException(
              `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(size / 1024 / 1024).toFixed(2)}MB`,
            );
          }
        }
      }
    } catch (error) {
      // If validation fails due to network error, log warning but continue
      // The actual download will fail later if size is too large
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn('Failed to validate image size before processing', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
