/**
 * Question type enumeration
 */
export type QuestionType = 'choice' | 'fill' | 'essay';

/**
 * Question region with percentage coordinates
 */
export interface QuestionRegion {
  /**
   * Question type: choice (选择题), fill (填空题), essay (解答题)
   */
  type: QuestionType;

  /**
   * Question number (1-based)
   */
  question_number: number;

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
 * Recognition result containing all detected regions
 */
export interface RecognitionResult {
  /**
   * Array of detected question regions
   */
  regions: QuestionRegion[];
}

