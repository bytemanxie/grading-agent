/**
 * Answer Recognition Service
 * 答题识别服务
 */

import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  QuestionAnswer,
  AnswerRecognitionResponse,
  RegionAnswerResult,
} from '../types/answer';
import type { QuestionType, QuestionRegion } from '../types/region';

@Injectable()
export class AnswerRecognitionService {
  private readonly logger = new Logger(AnswerRecognitionService.name);
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
   * Recognize answers from full image URL (without region cropping)
   * 从完整图片URL识别答案（不需要区域裁剪）
   * @param imageUrl Image URL
   * @returns All recognized answers grouped by question type
   */
  async recognizeAnswersFromImage(
    imageUrl: string,
  ): Promise<AnswerRecognitionResponse> {
    const prompt = this.buildFullImagePrompt();

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

    return this.parseFullImageResponse(content);
  }

  /**
   * Recognize answers from cropped region image
   * @param imageBuffer Cropped image buffer
   * @param regionType Question type (choice/fill/essay)
   * @param region Original region information
   * @returns Recognized answers
   */
  async recognizeAnswers(
    imageBuffer: Buffer,
    regionType: QuestionType,
    region: QuestionRegion,
  ): Promise<QuestionAnswer[]> {
    const prompt = this.buildPrompt(regionType);

    // Convert buffer to base64 data URL
    const base64Image = imageBuffer.toString('base64');
    const mimeType = this.detectMimeType(imageBuffer);
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const message = new HumanMessage({
      content: [
        {
          type: 'image_url',
          image_url: {
            url: dataUrl,
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

    return this.parseResponse(content, regionType);
  }

  /**
   * Build prompt based on question type
   */
  private buildPrompt(regionType: QuestionType): string {
    const prompts = {
      choice: `请识别这张图片中的所有选择题答案。

要求：
1. 识别每道题选择的选项（A、B、C、D等）
2. 如果题目没有选择答案，返回空字符串或"未作答"
3. 返回 JSON 格式，包含所有题目的答案

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 1,
      "answer": "A"
    },
    {
      "question_number": 2,
      "answer": "B"
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`,

      fill: `请识别这张图片中的所有填空题答案。

要求：
1. 识别每道题的填空内容
2. 如果题目没有填写答案，返回空字符串或"未作答"
3. 返回 JSON 格式，包含所有题目的答案

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 1,
      "answer": "答案内容"
    },
    {
      "question_number": 2,
      "answer": "另一个答案"
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`,

      essay: `请识别这张图片中的所有解答题答案。

要求：
1. 识别每道题的解答内容（文字内容）
2. 如果题目没有解答，返回空字符串或"未作答"
3. 返回 JSON 格式，包含所有题目的答案

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 1,
      "answer": "解答内容..."
    },
    {
      "question_number": 2,
      "answer": "另一个解答内容..."
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`,
    };

    return prompts[regionType];
  }

  /**
   * Build prompt for full image recognition (all question types)
   */
  private buildFullImagePrompt(): string {
    return `请识别这张答题卡图片中的所有答案，包括选择题、填空题和解答题。

要求：
1. **选择题**：识别每道题选择的选项（A、B、C、D等），如果未作答返回空字符串
2. **填空题**：识别每道题的填空内容，如果未作答返回空字符串
3. **解答题**：识别每道题的解答内容（文字内容），如果未作答返回空字符串
4. 返回 JSON 格式，按题目类型分组

JSON 格式：
\`\`\`json
{
  "regions": [
    {
      "type": "choice",
      "questions": [
        {
          "question_number": 1,
          "answer": "A"
        },
        {
          "question_number": 2,
          "answer": "B"
        }
      ]
    },
    {
      "type": "fill",
      "questions": [
        {
          "question_number": 1,
          "answer": "答案内容"
        }
      ]
    },
    {
      "type": "essay",
      "questions": [
        {
          "question_number": 1,
          "answer": "解答内容..."
        }
      ]
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`;
  }

  /**
   * Parse full image response to AnswerRecognitionResponse
   */
  private parseFullImageResponse(content: string): AnswerRecognitionResponse {
    let jsonContent = content.trim();
    this.logger.debug('Parsing full image response', { jsonContent });

    // Extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonContent) as {
        regions: Array<{
          type: QuestionType;
          questions: QuestionAnswer[];
        }>;
      };

      // Validate structure
      if (!parsed.regions || !Array.isArray(parsed.regions)) {
        throw new Error('Invalid response format: missing regions array');
      }

      // Convert to RegionAnswerResult format
      const regionResults: RegionAnswerResult[] = parsed.regions.map(
        (region) => {
          const validQuestions = region.questions.filter((question) => {
            return this.validateQuestion(question);
          });

          return {
            type: region.type,
            region: {
              type: region.type,
              question_number: 1,
              x_min_percent: 0,
              y_min_percent: 0,
              x_max_percent: 100,
              y_max_percent: 100,
            },
            questions: validQuestions,
          };
        },
      );

      return {
        regions: regionResults,
      };
    } catch (error) {
      this.logger.error('Failed to parse full image response', {
        error: error instanceof Error ? error.message : String(error),
        content,
      });
      throw new Error(
        `Failed to parse model response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Detect MIME type from image buffer
   */
  private detectMimeType(buffer: Buffer): string {
    // Check magic numbers for common image formats
    const header = buffer.slice(0, 12);

    // JPEG: FF D8 FF
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return 'image/png';
    }

    // WebP: RIFF ... WEBP
    if (
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      buffer.slice(8, 12).toString() === 'WEBP'
    ) {
      return 'image/webp';
    }

    // GIF: GIF87a or GIF89a
    if (
      (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) ||
      buffer.slice(0, 6).toString() === 'GIF89a'
    ) {
      return 'image/gif';
    }

    // Default to jpeg
    return 'image/jpeg';
  }

  /**
   * Parse model response to QuestionAnswer array
   */
  private parseResponse(
    content: string,
    regionType: QuestionType,
  ): QuestionAnswer[] {
    // Remove markdown code block markers if present
    let jsonContent = content.trim();
    this.logger.debug('Parsing response', { jsonContent, regionType });

    // Extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonContent) as { questions: QuestionAnswer[] };

      // Validate structure
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error('Invalid response format: missing questions array');
      }

      // Validate and filter questions
      const validQuestions: QuestionAnswer[] = parsed.questions.filter(
        (question) => {
          return this.validateQuestion(question);
        },
      );

      return validQuestions;
    } catch (error) {
      this.logger.error('Failed to parse model response', {
        error: error instanceof Error ? error.message : String(error),
        content,
        regionType,
      });
      throw new Error(
        `Failed to parse model response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate a question answer
   */
  private validateQuestion(question: unknown): question is QuestionAnswer {
    if (typeof question !== 'object' || question === null) {
      return false;
    }

    const q = question as Record<string, unknown>;

    // Check required fields
    if (typeof q.question_number !== 'number' || typeof q.answer !== 'string') {
      return false;
    }

    return true;
  }
}
