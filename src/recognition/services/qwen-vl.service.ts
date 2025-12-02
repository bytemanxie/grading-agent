/**
 * Qwen-VL Service using LangChain
 * 使用 LangChain 调用 Qwen3-VL-235B-A22B 模型进行试卷区域分割
 */

import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MAX_IMAGE_SIZE } from '../../common/constants';
import type {
  RecognitionResult,
  QuestionRegion,
} from '../../common/types/region';

@Injectable()
export class QwenVLService {
  private readonly logger = new Logger(QwenVLService.name);
  private model: ChatOpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('dashscope.apiKey');
    const model =
      this.configService.get<string>('dashscope.model') || 'qwen-vl-max-latest';
    const baseURL =
      this.configService.get<string>('dashscope.baseURL') ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1';

    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is required');
    }

    this.model = new ChatOpenAI({
      model,
      configuration: {
        apiKey,
        baseURL,
      },
      temperature: 0.1,
      maxTokens: 4096,
    });
  }

  /**
   * Validate image size before processing
   * @param imageUrl Image URL to validate
   */
  private async validateImageSize(imageUrl: string): Promise<void> {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (!response.ok) {
        // If HEAD request fails, try GET with range to check size
        const getResponse = await fetch(imageUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
        });
        const contentLength = getResponse.headers.get('content-length');
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (size > MAX_IMAGE_SIZE) {
            throw new BadRequestException(
              `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(size / 1024 / 1024).toFixed(2)}MB`,
            );
          }
        }
      } else {
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (size > MAX_IMAGE_SIZE) {
            throw new BadRequestException(
              `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE / 1024 / 1024}MB. Image size: ${(size / 1024 / 1024).toFixed(2)}MB`,
            );
          }
        }
      }
    } catch (error) {
      // If validation fails due to network error, log warning but continue
      // The actual download will fail later if size is too large
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn('Failed to validate image size before processing', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Recognize question regions from exam paper image
   * @param imageUrl Image URL of the exam paper
   * @returns Recognition result with question regions
   */
  async recognizeRegions(imageUrl: string): Promise<RecognitionResult> {
    // Validate image size before processing
    await this.validateImageSize(imageUrl);

    const prompt = this.buildPrompt();

    const message = new HumanMessage({
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    });

    const response = await this.model.invoke([message]);
    const content = response.content as string;

    if (!content) {
      throw new Error('Model returned empty response');
    }

    return this.parseResponse(content);
  }

  /**
   * Build prompt for region recognition
   */
  private buildPrompt(): string {
    return `请分析这张空白答题卡图片，识别出选择题区域和每道题的分数：

1. **选择题区域**（choice）：精确识别所有选择题，合并为一个区域（可选）
   - 如果试卷中有选择题，精确识别选择题的边界，确保包含所有选择题
   - 只返回一个 choice 区域，覆盖所有选择题的范围
   - 边界要精确，不要遗漏任何选择题
   - **如果试卷中没有选择题，regions 数组可以为空**

2. **分数信息**（scores）：识别试卷上每道题的题号和分值
   - 从试卷图片上标注的分数中提取
   - 返回题号和对应的分值
   - 必须识别所有题目的分数

重要要求：
- 只识别选择题区域，其他区域暂时不需要识别
- 如果试卷中有选择题，选择题区域要精确识别，只返回一个区域；如果没有选择题，regions 数组可以为空数组
- 分数信息单独返回为一个数组，必须包含所有题目的分数
- 坐标必须是百分比形式（0-100），相对于整个图片的尺寸
- 必须直接返回有效的 JSON 格式，不要使用 markdown 代码块

JSON 格式（有选择题的情况）：
{
  "regions": [
    {
      "type": "choice",
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 35.0
    }
  ],
  "scores": [
    {"questionNumber": 1, "score": 2},
    {"questionNumber": 2, "score": 2},
    {"questionNumber": 3, "score": 10},
    {"questionNumber": 4, "score": 15}
  ]
}

JSON 格式（没有选择题的情况）：
{
  "regions": [],
  "scores": [
    {"questionNumber": 1, "score": 10},
    {"questionNumber": 2, "score": 15}
  ]
}

请直接返回 JSON，不要包含其他文字说明，不要使用 markdown 代码块。`;
  }

  /**
   * Parse model response to RecognitionResult
   */
  private parseResponse(content: string): RecognitionResult {
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
      const expandedRegions: QuestionRegion[] = validRegions.map((region) => ({
        ...region,
        x_min_percent: Math.max(0, region.x_min_percent - 2),
        y_min_percent: Math.max(0, region.y_min_percent - 2),
        x_max_percent: Math.min(100, region.x_max_percent + 2),
        y_max_percent: Math.min(100, region.y_max_percent + 2),
      }));

      this.logger.debug('Successfully parsed response', {
        regionCount: expandedRegions.length,
        scoreCount: validScores.length,
      });

      return {
        regions: expandedRegions,
        scores: validScores,
      };
    } catch (error) {
      this.logger.error('Failed to parse model response', {
        error: error instanceof Error ? error.message : String(error),
        content,
        jsonContent,
      });
      throw new Error(
        `Failed to parse model response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate a question region
   */
  private validateRegion(region: unknown): region is QuestionRegion {
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

    // Validate coordinate ranges (0-100)
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
  private validateScore(score: unknown): boolean {
    if (typeof score !== 'object' || score === null) {
      return false;
    }

    const s = score as Record<string, unknown>;

    // Check required fields
    if (typeof s.questionNumber !== 'number' || typeof s.score !== 'number') {
      return false;
    }

    // Validate questionNumber is positive
    if (s.questionNumber <= 0 || !Number.isInteger(s.questionNumber)) {
      return false;
    }

    // Validate score is positive
    if (s.score <= 0) {
      return false;
    }

    return true;
  }
}
