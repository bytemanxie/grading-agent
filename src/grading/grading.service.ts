/**
 * Grading Service
 * 批改服务 - 协调批改流程和并发控制
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';

import type { AnswerRecognitionResponse } from '../common/types/answer';
import type { RecognitionResult } from '../common/types/region';
import { RecognitionService } from '../recognition/recognition.service';

import type { GradeBatchDto } from './dto/grade-batch.dto';
import {
  CallbackService,
  type CallbackData,
} from './services/callback.service';
import {
  ScoreCalculationService,
  type ScoreCalculationResult,
} from './services/score-calculation.service';

@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly recognitionService: RecognitionService,
    private readonly scoreCalculationService: ScoreCalculationService,
    private readonly callbackService: CallbackService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Grade a batch of sheets
   * 批量批改卷子
   * @param dto Batch grading request DTO
   * @returns Batch grading response
   */
  async gradeBatch(dto: GradeBatchDto) {
    this.logger.log(`Starting batch grading for ${dto.sheets.length} sheets`);

    // Get max concurrent from config (default: 5)
    const maxConcurrent =
      this.configService.get<number>('grading.maxConcurrent') || 5;

    // Create concurrency limiter
    const limit = pLimit(maxConcurrent);
    this.logger.log(`Using concurrency limit: ${maxConcurrent}`);

    // Process all sheets with concurrency control
    const tasks = dto.sheets.map((sheet) =>
      limit(async () => {
        try {
          await this.gradeSheet(
            sheet.gradingSheetId,
            sheet.studentSheetImageUrls,
            dto.blankSheetRecognition,
            dto.answerRecognition,
            dto.callbackUrl,
          );
        } catch (error) {
          this.logger.error(
            `Failed to grade sheet ${sheet.gradingSheetId}`,
            error instanceof Error ? error.message : String(error),
          );
          // Send failure callback
          await this.callbackService.sendCallback(dto.callbackUrl, {
            gradingSheetId: sheet.gradingSheetId,
            status: 'failed',
            failureReason:
              error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }),
    );

    // Wait for all tasks to complete
    await Promise.all(tasks);

    this.logger.log(`Batch grading completed for ${dto.sheets.length} sheets`);

    return {
      success: true,
      message: `Batch grading request accepted, processing ${dto.sheets.length} sheets`,
      submittedCount: dto.sheets.length,
    };
  }

  /**
   * Grade a single sheet (may contain multiple pages)
   * 批改单张卷子（可能包含多页）
   * @param gradingSheetId GradingSheet ID
   * @param studentSheetImageUrls Student answer sheet image URLs (ordered by page number)
   * @param blankSheetRecognition Blank sheet recognition results (ordered by page number)
   * @param answerRecognition Standard answer recognition results (ordered by page number)
   * @param callbackUrl Callback URL
   */
  private async gradeSheet(
    gradingSheetId: number,
    studentSheetImageUrls: string[],
    blankSheetRecognition: RecognitionResult[],
    answerRecognition: AnswerRecognitionResponse[],
    callbackUrl: string,
  ): Promise<void> {
    this.logger.log(
      `Grading sheet ${gradingSheetId} with ${studentSheetImageUrls.length} pages...`,
    );

    try {
      // Validate arrays have the same length
      if (
        studentSheetImageUrls.length !== blankSheetRecognition.length ||
        studentSheetImageUrls.length !== answerRecognition.length
      ) {
        throw new Error(
          `Mismatch in array lengths: student sheets (${studentSheetImageUrls.length}), blank sheets (${blankSheetRecognition.length}), answer keys (${answerRecognition.length})`,
        );
      }

      // Process each page: recognize answers and calculate scores
      const pageResults: Array<{
        studentAnswers: AnswerRecognitionResponse;
        scoreResult: ScoreCalculationResult;
      }> = [];

      for (let i = 0; i < studentSheetImageUrls.length; i++) {
        const studentSheetImageUrl = studentSheetImageUrls[i];
        // Note: pageBlankSheetRecognition is available but not currently used in recognition
        // It may be needed for future enhancements
        const _pageBlankSheetRecognition = blankSheetRecognition[i];
        const pageAnswerRecognition = answerRecognition[i];

        this.logger.debug(
          `Processing page ${i + 1}/${studentSheetImageUrls.length} for sheet ${gradingSheetId}`,
        );

        // Step 1: Recognize student answers for this page
        const studentAnswers =
          await this.recognitionService.recognizeAnswers(studentSheetImageUrl);

        this.logger.debug(
          `Student answers recognized for sheet ${gradingSheetId}, page ${i + 1}`,
        );

        // Step 2: Calculate scores using AI model for this page
        const scoreResult = await this.scoreCalculationService.calculateScores(
          studentAnswers,
          pageAnswerRecognition,
        );

        this.logger.debug(
          `Scores calculated for sheet ${gradingSheetId}, page ${i + 1}: ${scoreResult.totalScore}`,
        );

        pageResults.push({
          studentAnswers,
          scoreResult,
        });
      }

      // Step 3: Merge results from all pages
      const mergedStudentAnswers =
        this.scoreCalculationService.mergeAnswerRecognition(
          pageResults.map((r) => r.studentAnswers),
        );

      const mergedScoreResult = this.scoreCalculationService.mergeScoreResults(
        pageResults.map((r) => r.scoreResult),
      );

      this.logger.log(
        `Merged scores for sheet ${gradingSheetId}: ${mergedScoreResult.totalScore} (from ${studentSheetImageUrls.length} pages)`,
      );

      // Step 4: Prepare callback data
      const callbackData: CallbackData = {
        gradingSheetId,
        recognizeResult: mergedStudentAnswers,
        objectiveScores: mergedScoreResult.objectiveScores,
        subjectiveScores: mergedScoreResult.subjectiveScores,
        finalScore: mergedScoreResult.totalScore.toString(),
        status: 'completed',
        resultPayload: {
          questions: mergedScoreResult.questions,
        },
      };

      // Step 5: Send callback
      await this.callbackService.sendCallback(callbackUrl, callbackData);

      this.logger.log(`Sheet ${gradingSheetId} graded successfully`);
    } catch (error) {
      this.logger.error(
        `Error grading sheet ${gradingSheetId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error; // Re-throw to be handled by caller
    }
  }
}
