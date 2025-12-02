/**
 * Answer recognition types
 * 答题识别类型定义
 */

import type { QuestionType, QuestionRegion } from './region';

/**
 * Single question answer result
 * 单道题的识别结果
 */
export interface QuestionAnswer {
  /**
   * Question number
   * 题目编号
   * Can be a number (1, 2, 3) or a string for sub-questions (e.g., "13(1)", "13(2)", "21(1)", "21(2)")
   * Supports sub-question format like "13(1)", "13(2)" for questions with sub-items
   */
  question_number: number | string;

  /**
   * Answer content
   * 答案内容
   * - For choice questions: "A", "B", "C", "D", etc.
   * - For essay questions: the answer text
   */
  answer: string;
}

/**
 * Region answer recognition result
 * 区域答题识别结果
 */
export interface RegionAnswerResult {
  /**
   * Question type
   * 题目类型
   */
  type: QuestionType;

  /**
   * Original region information
   * 原始区域信息
   */
  region: QuestionRegion;

  /**
   * Recognized answers for all questions in this region
   * 该区域内所有题目的识别答案
   */
  questions: QuestionAnswer[];
}

/**
 * Complete answer recognition response
 * 完整的答题识别响应
 */
export interface AnswerRecognitionResponse {
  /**
   * All region recognition results
   * 所有区域的识别结果
   */
  regions: RegionAnswerResult[];
}
