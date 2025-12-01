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
    return `请分析这张试卷图片，识别出答题区域：

1. **选择题区域**（choice）：精确识别每个选择题区域
   - 如果选择题分布在多个位置，返回多个区域
   - 确保覆盖所有选择题，不要遗漏
   - 可以返回多个 choice 类型的区域

2. **填空题区域**（fill）：框选所有填空题
   - 如果填空题分布在多个位置，返回多个区域
   - 确保覆盖所有填空题，不要遗漏
   - 可以返回多个 fill 类型的区域

3. **解答题区域**（essay）：框选所有解答题
   - 如果解答题分布在多个位置，返回多个区域
   - 确保覆盖所有解答题，不要遗漏
   - 可以返回多个 essay 类型的区域

重要要求：
- 选择题区域要精确识别，可以返回多个区域
- 填空题和解答题如果分布在多个位置，也可以返回多个区域
- **必须确保不遗漏任何题目，这是最重要的要求**
- 如果试卷中没有某种类型的题目，则不要返回该类型
- 坐标必须是百分比形式（0-100），相对于整个图片的尺寸
- 必须直接返回有效的 JSON 格式，不要使用 markdown 代码块

JSON 格式：
{
  "regions": [
    {
      "type": "choice",
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 45.0,
      "y_max_percent": 30.0
    },
    {
      "type": "choice",
      "x_min_percent": 50.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 30.0
    },
    {
      "type": "fill",
      "x_min_percent": 5.0,
      "y_min_percent": 30.0,
      "x_max_percent": 95.0,
      "y_max_percent": 50.0
    },
    {
      "type": "fill",
      "x_min_percent": 5.0,
      "y_min_percent": 50.0,
      "x_max_percent": 95.0,
      "y_max_percent": 60.0
    },
    {
      "type": "essay",
      "x_min_percent": 5.0,
      "y_min_percent": 60.0,
      "x_max_percent": 95.0,
      "y_max_percent": 90.0
    }
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

      // Validate structure
      if (!parsed.regions || !Array.isArray(parsed.regions)) {
        throw new Error('Invalid response format: missing regions array');
      }

      // Validate and filter regions
      const validRegions: QuestionRegion[] = parsed.regions.filter((region) => {
        return this.validateRegion(region);
      });

      if (validRegions.length === 0) {
        throw new Error('No valid regions found in response');
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
      });

      return {
        regions: expandedRegions,
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

    // Check required fields (no question_number needed)
    if (
      typeof r.type !== 'string' ||
      !['choice', 'fill', 'essay'].includes(r.type) ||
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
}
