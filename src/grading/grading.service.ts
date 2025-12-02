/**
 * Grading Service
 * 批改服务 - 协调批改流程和并发控制
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
   * Process tasks with concurrency limit
   * 并发控制处理任务
   */
  private async processWithConcurrencyLimit<T>(
    tasks: Array<() => Promise<T>>,
    limit: number,
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const promise = task().then((result) => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
      });

      executing.push(promise);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

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

    this.logger.log(`Using concurrency limit: ${maxConcurrent}`);

    // Process all sheets with concurrency control
    const tasks = dto.sheets.map((sheet) => async () => {
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
        // Send failure callback (non-blocking: don't fail batch if callback fails)
        try {
          await this.callbackService.sendCallback(dto.callbackUrl, {
            gradingSheetId: sheet.gradingSheetId,
            status: 'failed',
            failureReason:
              error instanceof Error ? error.message : 'Unknown error',
          });
        } catch (callbackError) {
          this.logger.warn(
            `Failed to send failure callback for sheet ${sheet.gradingSheetId}`,
            callbackError instanceof Error
              ? callbackError.message
              : String(callbackError),
          );
        }
        throw error; // Re-throw to mark task as failed
      }
    });

    // Process tasks with concurrency limit
    await this.processWithConcurrencyLimit(tasks, maxConcurrent);

    this.logger.log(`Batch grading completed for ${dto.sheets.length} sheets`);

    return {
      success: true,
      message: `Batch grading request accepted, processing ${dto.sheets.length} sheets`,
      submittedCount: dto.sheets.length,
    };
  }

  /**
   * Extract answer by question number from answer recognition result
   * 从答案识别结果中提取指定题号的答案
   * @param answerRecognition Answer recognition result
   * @param questionNumber Question number (can be number or string for Chinese question numbers)
   * @returns Answer string or undefined if not found
   */
  private extractAnswerByQuestionNumber(
    answerRecognition: AnswerRecognitionResponse,
    questionNumber: number | string,
  ): string | undefined {
    for (const region of answerRecognition.regions) {
      for (const question of region.questions) {
        if (question.question_number === questionNumber) {
          return question.answer;
        }
      }
    }
    return undefined;
  }

  /**
   * Grade a single sheet (may contain multiple pages)
   * 批改单张卷子（可能包含多页）
   * @param gradingSheetId GradingSheet ID
   * @param studentSheetImageUrls Student answer sheet image URLs (ordered by page number)
   * @param blankSheetRecognition Blank sheet recognition results (ordered by page number)
   * @param answerRecognition Standard answer recognition results (can be single object or array)
   * @param callbackUrl Callback URL
   */
  private async gradeSheet(
    gradingSheetId: number,
    studentSheetImageUrls: string[],
    blankSheetRecognition: RecognitionResult[],
    answerRecognition: AnswerRecognitionResponse | AnswerRecognitionResponse[],
    callbackUrl: string,
  ): Promise<void> {
    this.logger.log(
      `Grading sheet ${gradingSheetId} with ${studentSheetImageUrls.length} pages...`,
    );

    try {
      // Validate arrays have the same length
      if (studentSheetImageUrls.length !== blankSheetRecognition.length) {
        throw new Error(
          `Mismatch in array lengths: student sheets (${studentSheetImageUrls.length}), blank sheets (${blankSheetRecognition.length})`,
        );
      }

      // Normalize answerRecognition: if single object, use it for all pages; if array, use per-page
      const isSingleAnswerRecognition = !Array.isArray(answerRecognition);
      const normalizedAnswerRecognition = isSingleAnswerRecognition
        ? answerRecognition
        : (answerRecognition as AnswerRecognitionResponse[]);

      // Process each page: recognize answers and calculate scores
      const pageResults: Array<{
        studentAnswers: AnswerRecognitionResponse;
        scoreResult: ScoreCalculationResult;
      }> = [];

      for (let i = 0; i < studentSheetImageUrls.length; i++) {
        const studentSheetImageUrl = studentSheetImageUrls[i];
        const pageBlankSheetRecognition = blankSheetRecognition[i];
        // Use single answer recognition for all pages, or per-page if array
        const pageAnswerRecognition = isSingleAnswerRecognition
          ? normalizedAnswerRecognition
          : normalizedAnswerRecognition[i];

        this.logger.debug(
          `Processing page ${i + 1}/${studentSheetImageUrls.length} for sheet ${gradingSheetId}`,
        );

        // Step 1: Recognize student answers for this page
        // Use new optimized method: choice regions cropped, essay regions from full image
        const studentAnswers =
          await this.recognitionService.recognizeStudentAnswers(
            studentSheetImageUrl,
            pageBlankSheetRecognition,
          );

        this.logger.debug(
          `Student answers recognized for sheet ${gradingSheetId}, page ${i + 1}`,
        );

        // Step 2: Calculate scores using AI model for this page
        // Pass blankSheetRecognition to use scores for max_score validation
        const scoreResult = await this.scoreCalculationService.calculateScores(
          studentAnswers,
          pageAnswerRecognition,
          pageBlankSheetRecognition,
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

      // Get merged standard answers: if single object, use it directly; if array, merge it
      const mergedStandardAnswers: AnswerRecognitionResponse =
        isSingleAnswerRecognition
          ? (normalizedAnswerRecognition as AnswerRecognitionResponse)
          : this.scoreCalculationService.mergeAnswerRecognition(
              normalizedAnswerRecognition as AnswerRecognitionResponse[],
            );

      this.logger.log(
        `Merged scores for sheet ${gradingSheetId}: ${mergedScoreResult.totalScore} (from ${studentSheetImageUrls.length} pages)`,
      );

      // Step 4: Enrich questions with student and standard answers
      const enrichedQuestions = mergedScoreResult.questions.map((question) => {
        const studentAnswer = this.extractAnswerByQuestionNumber(
          mergedStudentAnswers,
          question.question_number,
        );
        const standardAnswer = this.extractAnswerByQuestionNumber(
          mergedStandardAnswers,
          question.question_number,
        );

        return {
          ...question,
          studentAnswer: studentAnswer || undefined,
          standardAnswer: standardAnswer || undefined,
        };
      });

      // Log grading results for debugging
      this.logger.log(`📊 Grading results for sheet ${gradingSheetId}:`, {
        finalScore: mergedScoreResult.totalScore,
        objectiveScores: mergedScoreResult.objectiveScores,
        subjectiveScores: mergedScoreResult.subjectiveScores,
        totalQuestions: enrichedQuestions.length,
        questions: enrichedQuestions.map((q) => ({
          question_number: q.question_number,
          type: q.type,
          score: q.score,
          max_score: q.max_score,
          reason: q.reason,
          studentAnswer: q.studentAnswer,
          standardAnswer: q.standardAnswer,
        })),
      });

      // Step 5: Prepare callback data
      const callbackData: CallbackData = {
        gradingSheetId,
        recognizeResult: mergedStudentAnswers,
        objectiveScores: mergedScoreResult.objectiveScores,
        subjectiveScores: mergedScoreResult.subjectiveScores,
        finalScore: mergedScoreResult.totalScore.toString(),
        maxScore: mergedScoreResult.totalMaxScore.toString(),
        status: 'completed',
        resultPayload: {
          questions: enrichedQuestions,
        },
      };

      // Step 6: Send callback (non-blocking: don't fail grading if callback fails)
      try {
        await this.callbackService.sendCallback(callbackUrl, callbackData);
        this.logger.log(`Sheet ${gradingSheetId} graded successfully`);
      } catch (callbackError) {
        // Log callback failure but don't fail the grading process
        this.logger.warn(
          `Callback failed for sheet ${gradingSheetId}, but grading completed successfully`,
          callbackError instanceof Error
            ? callbackError.message
            : String(callbackError),
        );
        this.logger.log(
          `Sheet ${gradingSheetId} graded successfully (callback failed)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error grading sheet ${gradingSheetId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error; // Re-throw to be handled by caller
    }
  }
}
