/**
 * Recognition Service
 * 识别服务 - 业务逻辑层
 */

import { Injectable, Logger } from '@nestjs/common';

import { AnswerRecognitionService } from '../services/answer-recognition.service';
import { ImageCropService } from '../services/image-crop.service';
import { QwenVLService } from '../services/qwen-vl.service';
import type {
  AnswerRecognitionResponse,
  RegionAnswerResult,
} from '../types/answer';
import type { RecognitionResult , QuestionRegion } from '../types/region';

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);

  constructor(
    private readonly qwenVLService: QwenVLService,
    private readonly answerRecognitionService: AnswerRecognitionService,
    private readonly imageCropService: ImageCropService,
  ) {}

  /**
   * Recognize regions from blank answer sheet image
   * 识别空白答题卡区域
   */
  async recognizeBlankSheet(imageUrl: string): Promise<RecognitionResult> {
    this.logger.log(`Recognizing blank sheet regions from image: ${imageUrl}`);
    return this.qwenVLService.recognizeRegions(imageUrl);
  }

  /**
   * Recognize answers from answer sheet image (full image, no region splitting)
   * 识别答案图片内容（整张图片，不需要区域分割）
   */
  async recognizeAnswers(imageUrl: string): Promise<AnswerRecognitionResponse> {
    this.logger.log(`Recognizing answers from image: ${imageUrl}`);
    return this.answerRecognitionService.recognizeAnswersFromImage(imageUrl);
  }

  /**
   * Recognize answers from exam paper image with regions (legacy method)
   * 识别答案（使用区域分割的旧方法，保留用于兼容）
   */
  async recognizeAnswersWithRegions(
    imageUrl: string,
    regions: QuestionRegion[],
  ): Promise<AnswerRecognitionResponse> {
    this.logger.log(
      `Recognizing answers from image: ${imageUrl}, regions: ${regions.length}`,
    );

    const regionResults: RegionAnswerResult[] = [];

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      this.logger.debug(
        `Processing region ${i + 1}/${regions.length} (${region.type})...`,
      );

      try {
        // Crop the region (with 2% expansion by default)
        const croppedImage = await this.imageCropService.cropRegion(
          imageUrl,
          region,
          2,
        );

        // Recognize answers
        const questions = await this.answerRecognitionService.recognizeAnswers(
          croppedImage,
          region.type,
          region,
        );

        this.logger.debug(
          `Found ${questions.length} questions in region ${i + 1}`,
        );

        regionResults.push({
          type: region.type,
          region,
          questions,
        });
      } catch (error) {
        this.logger.error(
          `Error processing region ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other regions even if one fails
        regionResults.push({
          type: region.type,
          region,
          questions: [],
        });
      }
    }

    return {
      regions: regionResults,
    };
  }
}
