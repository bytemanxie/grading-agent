/**
 * Answer recognition types
 * 答题识别类型定义
 */

import type { QuestionType, QuestionRegion } from './region.js';

/**
 * Single question answer result
 * 单道题的识别结果
 */
export interface QuestionAnswer {
  /**
   * Question number
   * 题目编号
   */
  question_number: number;

  /**
   * Answer content
   * 答案内容
   * - For choice questions: "A", "B", "C", "D", etc.
   * - For fill questions: the filled text
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

