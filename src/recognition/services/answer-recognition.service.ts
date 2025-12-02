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
} from '../../common/types/answer';
import type { QuestionType, QuestionRegion } from '../../common/types/region';

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
   * @param excludeChoiceRegions Optional: exclude choice regions and only recognize essay questions
   * @returns All recognized answers grouped by question type
   */
  async recognizeAnswersFromImage(
    imageUrl: string,
    excludeChoiceRegions?: boolean,
  ): Promise<AnswerRecognitionResponse> {
    const prompt = this.buildFullImagePrompt(excludeChoiceRegions);

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
   * Recognize answers from multiple images (batch recognition)
   * 批量识别多张图片的答案 - 在一次对话中将所有图片发送给大模型，返回一个合并的结果
   * @param imageUrls Array of image URLs
   * @param excludeChoiceRegions Optional: exclude choice regions and only recognize essay questions
   * @returns Merged recognition result containing all questions from all images
   */
  async recognizeAnswersFromImages(
    imageUrls: string[],
    excludeChoiceRegions?: boolean,
  ): Promise<AnswerRecognitionResponse> {
    if (imageUrls.length === 0) {
      throw new Error('At least one image URL is required');
    }

    this.logger.log(
      `Recognizing answers from ${imageUrls.length} images in batch (merged result)`,
    );

    const prompt = this.buildBatchImagePrompt(
      excludeChoiceRegions,
      imageUrls.length,
    );

    // Build message with all images
    const message = new HumanMessage({
      content: [
        // Add all images
        ...imageUrls.map((url) => ({
          type: 'image_url' as const,
          image_url: {
            url,
          },
        })),
        // Add prompt text
        {
          type: 'text' as const,
          text: prompt,
        },
      ],
    });

    const response = await this.model.invoke([message]);
    const content = response.content as string;

    if (!content) {
      throw new Error('Model returned empty response');
    }

    // Parse as single merged result (not array)
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
    const prompts: Record<string, string> = {
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
   * Build prompt for full image recognition (all question types or essay only)
   * @param excludeChoiceRegions If true, only recognize essay questions (exclude choice questions)
   */
  private buildFullImagePrompt(excludeChoiceRegions?: boolean): string {
    if (excludeChoiceRegions) {
      return `请识别这张学生答题卡图片中的解答题答案（不包括选择题）。

要求：
1. **只识别解答题**：忽略所有选择题区域，只识别解答题的答案内容
2. 识别每道解答题的解答文字内容
3. 如果题目没有解答，返回空字符串或"未作答"
4. 不需要关注题目在图片中的位置区域，只需要识别每道解答题的答案内容
5. 返回 JSON 格式，包含所有解答题的答案

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 5,
      "type": "essay",
      "answer": "解答内容..."
    },
    {
      "question_number": 6,
      "type": "essay",
      "answer": "另一个解答内容..."
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`;
    }

    return `请识别这张标准答案图片中每道题的答案。

要求：
1. 识别所有题目的答案，包括选择题和解答题
2. **选择题**：识别选择的选项（A、B、C、D等）
3. **解答题**：识别解答的文字内容
4. 不需要关注题目在图片中的位置区域，只需要识别每道题的答案内容
5. 返回 JSON 格式，包含所有题目的答案

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 1,
      "type": "choice",
      "answer": "A"
    },
    {
      "question_number": 2,
      "type": "choice",
      "answer": "B"
    },
    {
      "question_number": 3,
      "type": "essay",
      "answer": "解答内容..."
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`;
  }

  /**
   * Build prompt for batch image recognition
   * @param excludeChoiceRegions If true, only recognize essay questions
   * @param imageCount Number of images
   */
  private buildBatchImagePrompt(
    excludeChoiceRegions?: boolean,
    imageCount?: number,
  ): string {
    const imageCountText =
      imageCount && imageCount > 1 ? `（共 ${imageCount} 张图片）` : '';

    if (excludeChoiceRegions) {
      return `请识别这些学生答题卡图片中的解答题答案（不包括选择题）${imageCountText}。

要求：
1. **只识别解答题**：忽略所有选择题区域，只识别解答题的答案内容
2. **合并所有图片**：将所有图片中的解答题答案合并到一个结果中
3. 识别每道解答题的解答文字内容
4. 如果题目没有解答，返回空字符串或"未作答"
5. 不需要关注题目在图片中的位置区域，只需要识别每道解答题的答案内容
6. 返回 JSON 格式，包含所有图片中的所有解答题答案（合并为一个结果）

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 5,
      "type": "essay",
      "answer": "解答内容..."
    },
    {
      "question_number": 6,
      "type": "essay",
      "answer": "另一道题的解答内容..."
    }
  ]
}
\`\`\`

请直接返回 JSON 对象，不要包含其他文字说明。`;
    }

    return `这些图片是标准答案图片${imageCountText}，请识别所有图片中每道题的标准答案。

要求：
1. **合并所有图片**：将所有图片中的题目答案合并到一个结果中
2. 识别所有题目的标准答案，包括选择题和解答题
3. **选择题**：识别标准答案的选项（A、B、C、D等）
4. **解答题**：识别标准答案的文字内容
5. 不需要关注题目在图片中的位置区域，只需要识别每道题的标准答案内容
6. 返回 JSON 格式，包含所有图片中的所有题目答案（合并为一个结果）

JSON 格式：
\`\`\`json
{
  "questions": [
    {
      "question_number": 1,
      "type": "choice",
      "answer": "A"
    },
    {
      "question_number": 2,
      "type": "choice",
      "answer": "B"
    },
    {
      "question_number": 3,
      "type": "essay",
      "answer": "解答内容..."
    }
  ]
}
\`\`\`

请直接返回 JSON 对象，不要包含其他文字说明。`;
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
      // Try new format first: { questions: [{ question_number, type, answer }] }
      const parsed = JSON.parse(jsonContent) as {
        questions?: Array<{
          question_number: number;
          type?: QuestionType;
          answer: string;
        }>;
        regions?: Array<{
          type: QuestionType;
          questions: QuestionAnswer[];
        }>;
      };

      // Support both new format (questions array) and legacy format (regions array)
      if (parsed.questions && Array.isArray(parsed.questions)) {
        // New format: group questions by type
        const questionsByType = new Map<QuestionType, QuestionAnswer[]>();

        parsed.questions.forEach((q) => {
          // Validate question
          if (
            typeof q.question_number !== 'number' ||
            typeof q.answer !== 'string'
          ) {
            return;
          }

          // Determine type: use provided type or infer from answer
          let questionType: QuestionType = q.type || 'choice';
          if (!q.type) {
            // Infer type: if answer is single letter (A-D), likely choice
            if (/^[A-D]$/i.test(q.answer.trim())) {
              questionType = 'choice';
            } else {
              // Other answers default to essay
              questionType = 'essay';
            }
          }

          if (!questionsByType.has(questionType)) {
            questionsByType.set(questionType, []);
          }

          questionsByType.get(questionType)!.push({
            question_number: q.question_number,
            answer: q.answer,
          });
        });

        // Convert to RegionAnswerResult format
        const regionResults: RegionAnswerResult[] = Array.from(
          questionsByType.entries(),
        ).map(([type, questions]) => ({
          type,
          region: {
            type,
            question_number: 1,
            x_min_percent: 0,
            y_min_percent: 0,
            x_max_percent: 100,
            y_max_percent: 100,
          },
          questions: questions.sort(
            (a, b) => a.question_number - b.question_number,
          ),
        }));

        return {
          regions: regionResults,
        };
      }

      // Legacy format: { regions: [{ type, questions: [...] }] }
      if (parsed.regions && Array.isArray(parsed.regions)) {
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
      }

      throw new Error(
        'Invalid response format: missing questions or regions array',
      );
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
   * Parse batch response to array of AnswerRecognitionResponse
   * @param content Response content from model
   * @param imageCount Expected number of images
   */
  private parseBatchResponse(
    content: string,
    imageCount: number,
  ): AnswerRecognitionResponse[] {
    let jsonContent = content.trim();
    this.logger.debug('Parsing batch response', { jsonContent, imageCount });

    // Extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonContent);

      // Ensure it's an array
      if (!Array.isArray(parsed)) {
        throw new Error('Batch response must be an array');
      }

      // Parse each result in the array
      return parsed.map((item, index) => {
        try {
          // Use the same parsing logic as parseFullImageResponse
          // Wrap the single item in a way that parseFullImageResponse can handle
          const wrappedContent = JSON.stringify({
            questions: item.questions || [],
          });
          return this.parseFullImageResponse(wrappedContent);
        } catch (error) {
          this.logger.error(
            `Failed to parse result for image ${index + 1}`,
            error instanceof Error ? error.message : String(error),
          );
          // Return empty result if parsing fails
          return {
            regions: [],
          };
        }
      });
    } catch (error) {
      this.logger.error(
        'Failed to parse batch response',
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(
        `Failed to parse batch response: ${error instanceof Error ? error.message : String(error)}`,
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
