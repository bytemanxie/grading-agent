/**
 * Qwen-VL Service using LangChain
 * 使用 LangChain 调用 Qwen3-VL-235B-A22B 模型进行试卷区域分割
 */

import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import type {
  RecognitionResult,
  QuestionRegion,
} from '../common/types/region.js';

/**
 * Qwen VL Service Configuration
 */
interface QwenVLConfig {
  /**
   * DashScope API Key
   */
  apiKey: string;

  /**
   * Model name (default: qwen-vl-max-latest)
   * Available models:
   * - qwen-vl-max-latest: Qwen VL Max (超大规模视觉语言模型)
   * - qwen-vl-plus-latest: Qwen VL Plus (增强版)
   * - qwen3-vl-plus: Qwen3 VL Plus (最新版本)
   */
  model?: string;

  /**
   * Base URL for DashScope API (OpenAI compatible mode)
   */
  baseURL?: string;
}

/**
 * Qwen VL Service Class
 */
export class QwenVLService {
  private model: ChatOpenAI;

  constructor(config: QwenVLConfig) {
    const {
      apiKey,
      model = 'qwen-vl-max-latest',
      baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    } = config;

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
   * Recognize question regions from exam paper image
   * @param imageUrl Image URL of the exam paper
   * @returns Recognition result with question regions
   */
  async recognizeRegions(imageUrl: string): Promise<RecognitionResult> {
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
    return `请分析这张试卷图片，识别出大的答题区域，包括：

1. **选择题区域**（choice）：包含所有选择题的大区域
2. **填空题区域**（fill）：包含所有填空题的大区域
3. **解答题区域**（essay）：包含所有解答题的大区域

**重要要求**：
- 只识别大的答题区域，不要细分到每道题
- 每个类型只返回一个区域，覆盖该类型所有题目的范围
- 如果试卷中没有某种类型的题目，则不要返回该类型
- 坐标必须是百分比形式（0-100），相对于整个图片的尺寸
- 必须返回有效的 JSON 格式

JSON 格式如下：

\`\`\`json
{
  "regions": [
    {
      "type": "choice",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 30.0
    },
    {
      "type": "fill",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 30.0,
      "x_max_percent": 95.0,
      "y_max_percent": 60.0
    },
    {
      "type": "essay",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 60.0,
      "x_max_percent": 95.0,
      "y_max_percent": 90.0
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`;
  }

  /**
   * Parse model response to RecognitionResult
   */
  private parseResponse(content: string): RecognitionResult {
    // Remove markdown code block markers if present
    let jsonContent = content.trim();
    console.log('jsonContent', jsonContent);

    // Extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

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

      return {
        regions: validRegions,
      };
    } catch (error) {
      console.error('Failed to parse model response:', error);
      console.error('Raw content:', content);
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

    // Check required fields
    if (
      typeof r.type !== 'string' ||
      !['choice', 'fill', 'essay'].includes(r.type) ||
      typeof r.question_number !== 'number' ||
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

/**
 * Create Qwen VL Service instance
 */
export function createQwenVLService(config: QwenVLConfig): QwenVLService {
  return new QwenVLService(config);
}
