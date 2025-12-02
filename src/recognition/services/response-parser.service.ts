/**
 * Response Parser Service
 * 负责解析和验证模型响应
 */

import { Injectable, Logger } from '@nestjs/common';

import type { AnswerRecognitionResponse } from '../../common/types/answer';
import type {
  RecognitionResult,
  QuestionRegion,
  QuestionScore,
} from '../../common/types/region';

@Injectable()
export class ResponseParserService {
  private readonly logger = new Logger(ResponseParserService.name);

  /**
   * Parse model response to RecognitionResult
   * 解析模型响应为 RecognitionResult
   */
  parseResponse(content: string): RecognitionResult {
    let jsonContent = content.trim();
    this.logger.debug('Parsing response', { jsonContent });

    // Strategy 1: Try to extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
      this.logger.debug('Extracted JSON from markdown code block');
    }

    // Strategy 2: Try to find JSON object in the content
    // Look for the first { and try to extract complete JSON
    if (!jsonContent.startsWith('{')) {
      const firstBrace = jsonContent.indexOf('{');
      if (firstBrace !== -1) {
        jsonContent = jsonContent.substring(firstBrace);
        this.logger.debug('Extracted JSON starting from first brace');
      }
    }

    // Strategy 3: If JSON appears to be truncated, try to find the last complete closing brace
    if (jsonContent.endsWith(',') || !jsonContent.endsWith('}')) {
      const lastCompleteBrace = jsonContent.lastIndexOf('}');
      if (lastCompleteBrace !== -1) {
        jsonContent = jsonContent.substring(0, lastCompleteBrace + 1);
        this.logger.debug(
          'Extracted complete JSON by finding last closing brace',
        );
      }
    }

    // Clean up: remove any trailing incomplete JSON
    jsonContent = jsonContent.trim();

    // Try to fix common JSON format errors
    const originalJsonContent = jsonContent;
    jsonContent = this.fixJsonFormatErrors(jsonContent);
    if (jsonContent !== originalJsonContent) {
      this.logger.debug('Fixed JSON format errors', {
        original: originalJsonContent.substring(0, 200),
        fixed: jsonContent.substring(0, 200),
      });
    }

    try {
      const parsed = JSON.parse(jsonContent) as RecognitionResult;

      // Validate structure - allow empty arrays
      const regions = Array.isArray(parsed.regions) ? parsed.regions : [];
      const scores = Array.isArray(parsed.scores) ? parsed.scores : [];

      // Validate and filter regions - allow empty result
      const validRegions: QuestionRegion[] = regions.filter((region) => {
        return this.validateRegion(region);
      });

      if (validRegions.length === 0) {
        this.logger.debug(
          'No valid regions found in response, returning empty array',
        );
      }

      // Validate and filter scores - allow empty result
      const validScores = scores.filter((score) => {
        return this.validateScore(score);
      });

      if (validScores.length === 0) {
        this.logger.debug(
          'No valid scores found in response, returning empty array',
        );
      }

      // Expand coordinates by 2% (outward expansion)
      const expandedRegions: QuestionRegion[] = validRegions.map((region) =>
        this.expandRegionCoordinates(region),
      );

      // Extract answers if present
      const answers = parsed.answers as AnswerRecognitionResponse | undefined;

      this.logger.debug('Successfully parsed response', {
        regionCount: expandedRegions.length,
        scoreCount: validScores.length,
        hasAnswers: !!answers,
        answersRegionCount: answers?.regions?.length || 0,
      });

      const result: RecognitionResult = {
        regions: expandedRegions,
        scores: validScores,
      };

      // Include answers if present
      if (answers) {
        result.answers = answers;
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Try to extract error position if it's a JSON parse error
      let errorDetails = errorMessage;
      const positionMatch = errorMessage.match(/position (\d+)/);
      if (positionMatch) {
        const position = parseInt(positionMatch[1], 10);
        const startPos = Math.max(0, position - 50);
        const endPos = Math.min(jsonContent.length, position + 50);
        const context = jsonContent.substring(startPos, endPos);
        errorDetails = `${errorMessage}\nContext around error position ${position}:\n${context}`;
      }

      this.logger.error('Failed to parse model response', {
        error: errorMessage,
        errorDetails,
        contentLength: content.length,
        jsonContentLength: jsonContent.length,
        jsonContentPreview: jsonContent.substring(0, 500),
        jsonContentSuffix:
          jsonContent.length > 500
            ? jsonContent.substring(jsonContent.length - 200)
            : '',
      });

      throw new Error(
        `Failed to parse model response: ${errorMessage}\n\nPlease check the JSON format. Common issues:\n` +
          `- Missing field names (e.g., "x_min": 50, 100, should be "x_min": 50, "y_min": 100,)\n` +
          `- Invalid JSON syntax\n` +
          `- Missing commas or quotes\n\n` +
          `JSON content preview:\n${jsonContent.substring(0, 500)}`,
      );
    }
  }

  /**
   * Fix common JSON format errors
   * 修复常见的JSON格式错误
   */
  fixJsonFormatErrors(jsonContent: string): string {
    let fixed = jsonContent;

    // Fix pattern: "x_min_percent": number, number, -> "x_min_percent": number, "y_min_percent": number,
    // This handles cases where the model omits the field name for y_min_percent
    // Example: "x_min_percent": 5.0, 10.0, -> "x_min_percent": 5.0, "y_min_percent": 10.0,
    fixed = fixed.replace(
      /"x_min_percent":\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,/g,
      '"x_min_percent": $1, "y_min_percent": $2,',
    );

    // Fix pattern: "x_max_percent": number, number, -> "x_max_percent": number, "y_max_percent": number,
    // This handles cases where the model omits the field name for y_max_percent
    // Example: "x_max_percent": 95.0, 35.0, -> "x_max_percent": 95.0, "y_max_percent": 35.0,
    fixed = fixed.replace(
      /"x_max_percent":\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,/g,
      '"x_max_percent": $1, "y_max_percent": $2,',
    );

    // Fix pattern: "x_max_percent": number, number } -> "x_max_percent": number, "y_max_percent": number }
    // Handle case where y_max_percent is missing before closing brace
    fixed = fixed.replace(
      /"x_max_percent":\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*}/g,
      '"x_max_percent": $1, "y_max_percent": $2 }',
    );

    // Fix pattern: "x_min_percent": number, number } -> "x_min_percent": number, "y_min_percent": number }
    // Handle case where y_min_percent is missing before closing brace
    fixed = fixed.replace(
      /"x_min_percent":\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*}/g,
      '"x_min_percent": $1, "y_min_percent": $2 }',
    );

    // Also handle legacy pixel format errors (for backward compatibility)
    fixed = fixed.replace(
      /"x_min":\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,/g,
      '"x_min_percent": $1, "y_min_percent": $2,',
    );
    fixed = fixed.replace(
      /"x_max":\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,/g,
      '"x_max_percent": $1, "y_max_percent": $2,',
    );

    return fixed;
  }

  /**
   * Expand region coordinates by 2% (outward expansion)
   * 扩展区域坐标（向外扩展2%）
   */
  expandRegionCoordinates(region: QuestionRegion): QuestionRegion {
    return {
      ...region,
      x_min_percent: Math.max(0, region.x_min_percent - 2),
      y_min_percent: Math.max(0, region.y_min_percent - 2),
      x_max_percent: Math.min(100, region.x_max_percent + 2),
      y_max_percent: Math.min(100, region.y_max_percent + 2),
    };
  }

  /**
   * Validate a question region
   * Note: Coordinate range validation (0-100) is handled by JSON Schema in structured output.
   * This method is kept for fallback manual parsing.
   */
  validateRegion(region: unknown): region is QuestionRegion {
    if (typeof region !== 'object' || region === null) {
      return false;
    }

    const r = region as Record<string, unknown>;

    // Check required fields (only choice and essay types)
    if (
      typeof r.type !== 'string' ||
      !['choice', 'essay'].includes(r.type) ||
      typeof r.x_min_percent !== 'number' ||
      typeof r.y_min_percent !== 'number' ||
      typeof r.x_max_percent !== 'number' ||
      typeof r.y_max_percent !== 'number'
    ) {
      return false;
    }

    // Validate coordinate ranges (0-100) - required for fallback parsing
    const coords = [
      r.x_min_percent,
      r.y_min_percent,
      r.x_max_percent,
      r.y_max_percent,
    ];

    for (const coord of coords) {
      if (coord < 0 || coord > 100) {
        return false;
      }
    }

    // Validate min < max
    if (
      r.x_min_percent >= r.x_max_percent ||
      r.y_min_percent >= r.y_max_percent
    ) {
      return false;
    }

    return true;
  }

  /**
   * Validate a question score
   */
  validateScore(score: unknown): boolean {
    if (typeof score !== 'object' || score === null) {
      return false;
    }

    const s = score as Record<string, unknown>;

    // Check required fields
    // questionNumber can be number or string (for Chinese question numbers)
    if (
      (typeof s.questionNumber !== 'number' &&
        typeof s.questionNumber !== 'string') ||
      typeof s.score !== 'number'
    ) {
      return false;
    }

    // Validate questionNumber
    if (typeof s.questionNumber === 'number') {
      // For numeric question numbers, must be positive integer
      if (s.questionNumber <= 0 || !Number.isInteger(s.questionNumber)) {
        return false;
      }
    } else {
      // For string question numbers (e.g., Chinese), must be non-empty
      if (s.questionNumber.trim().length === 0) {
        return false;
      }
    }

    // Validate score is positive
    if (s.score <= 0) {
      return false;
    }

    return true;
  }
}
