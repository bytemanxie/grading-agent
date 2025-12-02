/**
 * Callback Service
 * 回调服务 - 封装回调 URL 调用逻辑
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Callback request data
 * 回调请求数据
 */
export interface CallbackData {
  gradingSheetId: number;
  recognizeResult?: any;
  objectiveScores?: any;
  subjectiveScores?: any;
  finalScore?: number | string;
  maxScore?: number | string; // 试卷总分（满分）
  status: 'completed' | 'failed';
  failureReason?: string;
  resultPayload?: any;
  metadata?: any;
}

@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  /**
   * Send callback to dl-front API
   * 发送回调到 dl-front API
   * @param callbackUrl Callback URL
   * @param data Callback data
   * @param retries Maximum number of retries (default: 3)
   * @returns Promise that resolves when callback succeeds
   */
  async sendCallback(
    callbackUrl: string,
    data: CallbackData,
    retries: number = 3,
  ): Promise<void> {
    this.logger.log(`Sending callback to ${callbackUrl}`, {
      gradingSheetId: data.gradingSheetId,
      status: data.status,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(
            `Callback failed with status ${response.status}: ${errorText}`,
          );
        }

        const result = await response.json().catch(() => ({}));
        this.logger.log(`Callback sent successfully`, {
          gradingSheetId: data.gradingSheetId,
          attempt: attempt + 1,
          result,
        });

        return; // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Callback attempt ${attempt + 1} failed`, {
          gradingSheetId: data.gradingSheetId,
          error: lastError.message,
          willRetry: attempt < retries,
        });

        // If not the last attempt, wait before retrying (exponential backoff)
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.logger.error(`Callback failed after ${retries + 1} attempts`, {
      gradingSheetId: data.gradingSheetId,
      error: lastError?.message,
    });

    throw new Error(
      `Callback failed after ${retries + 1} attempts: ${lastError?.message}`,
    );
  }
}
