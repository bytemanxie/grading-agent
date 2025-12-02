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
   */
  questionNumber: number;

  /**
   * Score value (分值)
   */
  score: number;
}

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
}
