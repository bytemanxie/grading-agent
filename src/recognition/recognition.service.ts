/**
 * Recognition Service
 * 识别服务 - 业务逻辑层
 */

import { Injectable, Logger } from '@nestjs/common';

import type {
  AnswerRecognitionResponse,
  RegionAnswerResult,
} from '../common/types/answer';
import type { RecognitionResult, QuestionRegion } from '../common/types/region';

import { AnswerRecognitionService } from './services/answer-recognition.service';
import { ImageCropService } from './services/image-crop.service';
import { QwenVLService } from './services/qwen-vl.service';

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

  /**
   * Recognize student answers with optimized I/O: choice questions use cropped regions, essay questions use full image
   * 识别学生答案（优化I/O）：选择题使用裁切区域，解答题使用整图识别
   * @param studentSheetImageUrl Student answer sheet image URL
   * @param blankSheetRecognition Blank sheet recognition result (contains regions and scores)
   * @returns Student answer recognition result
   */
  async recognizeStudentAnswers(
    studentSheetImageUrl: string,
    blankSheetRecognition: RecognitionResult,
  ): Promise<AnswerRecognitionResponse> {
    this.logger.log(
      `Recognizing student answers from image: ${studentSheetImageUrl}`,
    );

    // Separate choice regions and essay regions
    const choiceRegions = blankSheetRecognition.regions.filter(
      (r) => r.type === 'choice',
    );
    const essayRegions = blankSheetRecognition.regions.filter(
      (r) => r.type === 'essay',
    );

    this.logger.debug(
      `Found ${choiceRegions.length} choice regions and ${essayRegions.length} essay regions`,
    );

    // Process choice regions in parallel (optimize I/O)
    const choiceAnswersPromises = choiceRegions.map(async (region) => {
      try {
        this.logger.debug(
          `Processing choice region: ${region.type} at (${region.x_min_percent}%, ${region.y_min_percent}%)`,
        );

        // Step 1: Crop the region (async download and crop)
        const croppedBuffer = await this.imageCropService.cropRegion(
          studentSheetImageUrl,
          region,
          2, // expandPercent
        );

        // Step 2: Recognize answers from cropped image
        const questions = await this.answerRecognitionService.recognizeAnswers(
          croppedBuffer,
          'choice',
          region,
        );

        this.logger.debug(
          `Recognized ${questions.length} choice questions in region`,
        );

        return {
          type: 'choice' as const,
          region,
          questions,
        };
      } catch (error) {
        this.logger.error(
          `Failed to recognize choice region`,
          error instanceof Error ? error.message : String(error),
        );
        // Return empty result, don't interrupt the flow
        return {
          type: 'choice' as const,
          region,
          questions: [],
        };
      }
    });

    // Process essay recognition in parallel with choice regions (optimize I/O)
    // Exclude choice regions and only recognize essay questions
    const essayAnswersPromise = this.answerRecognitionService
      .recognizeAnswersFromImage(studentSheetImageUrl, true) // excludeChoiceRegions = true
      .then((fullImageAnswers) => {
        // Filter essay regions from full image recognition (should already be filtered by prompt)
        const essayRegionsFromImage = fullImageAnswers.regions.filter(
          (r) => r.type === 'essay',
        );

        this.logger.debug(
          `Recognized ${essayRegionsFromImage.length} essay regions from full image`,
        );

        return essayRegionsFromImage;
      })
      .catch((error) => {
        this.logger.error(
          `Failed to recognize essay answers from full image`,
          error instanceof Error ? error.message : String(error),
        );
        // Return empty essay regions if recognition fails
        return [] as RegionAnswerResult[];
      });

    // Wait for all async operations to complete in parallel
    const [choiceAnswers, essayRegionsFromImage] = await Promise.all([
      Promise.all(choiceAnswersPromises),
      essayAnswersPromise,
    ]);

    // Merge results
    const allRegions: RegionAnswerResult[] = [
      ...choiceAnswers,
      ...essayRegionsFromImage,
    ];

    this.logger.log(
      `Student answers recognized: ${choiceAnswers.length} choice regions, ${essayRegionsFromImage.length} essay regions`,
    );

    return {
      regions: allRegions,
    };
  }
}
