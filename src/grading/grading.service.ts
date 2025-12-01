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
import { ScoreCalculationService } from './services/score-calculation.service';

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
            sheet.studentSheetImageUrl,
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
   * Grade a single sheet
   * 批改单张卷子
   * @param gradingSheetId GradingSheet ID
   * @param studentSheetImageUrl Student answer sheet image URL
   * @param blankSheetRecognition Blank sheet recognition result
   * @param answerRecognition Standard answer recognition result
   * @param callbackUrl Callback URL
   */
  private async gradeSheet(
    gradingSheetId: number,
    studentSheetImageUrl: string,
    blankSheetRecognition: RecognitionResult,
    answerRecognition: AnswerRecognitionResponse,
    callbackUrl: string,
  ): Promise<void> {
    this.logger.log(`Grading sheet ${gradingSheetId}...`);

    try {
      // Step 1: Recognize student answers
      const studentAnswers =
        await this.recognitionService.recognizeAnswers(studentSheetImageUrl);

      this.logger.debug(
        `Student answers recognized for sheet ${gradingSheetId}`,
      );

      // Step 2: Calculate scores using AI model
      const scoreResult = await this.scoreCalculationService.calculateScores(
        studentAnswers,
        answerRecognition,
      );

      this.logger.log(
        `Scores calculated for sheet ${gradingSheetId}: ${scoreResult.totalScore}`,
      );

      // Step 3: Prepare callback data
      const callbackData: CallbackData = {
        gradingSheetId,
        recognizeResult: studentAnswers,
        objectiveScores: scoreResult.objectiveScores,
        subjectiveScores: scoreResult.subjectiveScores,
        finalScore: scoreResult.totalScore.toString(),
        status: 'completed',
        resultPayload: {
          questions: scoreResult.questions,
        },
      };

      // Step 4: Send callback
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
