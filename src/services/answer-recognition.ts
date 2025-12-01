/**
 * Answer Recognition Service
 * 答题识别服务
 */

import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import type { QuestionAnswer } from '../common/types/answer.js';
import type { QuestionType, QuestionRegion } from '../common/types/region.js';

/**
 * Answer Recognition Service Configuration
 */
interface AnswerRecognitionConfig {
  /**
   * DashScope API Key
   */
  apiKey: string;

  /**
   * Model name (default: qwen-vl-max-latest)
   */
  model?: string;

  /**
   * Base URL for DashScope API (OpenAI compatible mode)
   */
  baseURL?: string;
}

/**
 * Answer Recognition Service Class
 */
export class AnswerRecognitionService {
  private model: ChatOpenAI;

  constructor(config: AnswerRecognitionConfig) {
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
    console.log('jsonContent', jsonContent);

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
      console.error('Failed to parse model response:', error);
      console.error('Raw content:', content);
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

/**
 * Create Answer Recognition Service instance
 */
export function createAnswerRecognitionService(
  config: AnswerRecognitionConfig,
): AnswerRecognitionService {
  return new AnswerRecognitionService(config);
}
