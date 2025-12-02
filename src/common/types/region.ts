/**
 * Question type enumeration
 */
export type QuestionType = 'choice' | 'essay';

/**
 * Question region with percentage coordinates
 */
export interface QuestionRegion {
  /**
   * Question type: choice (选择题), essay (解答题)
   */
  type: QuestionType;

  /**
   * Minimum X coordinate as percentage (0-100)
   */
  x_min_percent: number;

  /**
   * Minimum Y coordinate as percentage (0-100)
   */
  y_min_percent: number;

  /**
   * Maximum X coordinate as percentage (0-100)
   */
  x_max_percent: number;

  /**
   * Maximum Y coordinate as percentage (0-100)
   */
  y_max_percent: number;
}

/**
 * Question score information
 */
export interface QuestionScore {
  /**
   * Question number (题号)
   * Can be a number (1, 2, 3) or a string (e.g., "六", "作文", "第一题", "4(1)", "4(2)")
   * Supports sub-question format like "4(1)", "4(2)" for questions with sub-items
   */
  questionNumber: number | string;

  /**
   * Score value (分值)
   */
  score: number;
}

import type { AnswerRecognitionResponse } from './answer';

/**
 * Recognition result containing all detected regions and scores
 */
export interface RecognitionResult {
  /**
   * Array of detected question regions
   */
  regions: QuestionRegion[];

  /**
   * Array of question scores (每道题的分数)
   */
  scores: QuestionScore[];

  /**
   * Standard answers (标准答案) - optional
   * Priority: blank sheet > answer images (for reference)
   */
  answers?: AnswerRecognitionResponse;
}
