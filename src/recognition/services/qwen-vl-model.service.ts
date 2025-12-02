/**
 * Qwen-VL Model Service
 * 管理 LangChain 模型实例和 Schema
 */

import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QwenVLModelService {
  private readonly model: ChatOpenAI;
  private readonly recognitionResultSchema: Record<string, unknown>;

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
      maxTokens: 8192, // Increased to support full standard answers including long essay questions
    });

    // Define JSON Schema for structured output with coordinate range validation
    this.recognitionResultSchema = {
      type: 'object',
      description: 'Recognition result containing question regions and scores',
      properties: {
        regions: {
          type: 'array',
          description:
            'Array of detected question regions. If the exam paper contains choice questions, this array must not be empty and must include the choice region.',
          items: {
            type: 'object',
            description: 'Question region with percentage coordinates',
            properties: {
              type: {
                type: 'string',
                enum: ['choice', 'essay'],
                description: 'Question type: choice (选择题) or essay (解答题)',
              },
              x_min_percent: {
                type: 'number',
                description: 'Minimum X coordinate as percentage (0-100)',
                minimum: 0,
                maximum: 100,
              },
              y_min_percent: {
                type: 'number',
                description: 'Minimum Y coordinate as percentage (0-100)',
                minimum: 0,
                maximum: 100,
              },
              x_max_percent: {
                type: 'number',
                description: 'Maximum X coordinate as percentage (0-100)',
                minimum: 0,
                maximum: 100,
              },
              y_max_percent: {
                type: 'number',
                description: 'Maximum Y coordinate as percentage (0-100)',
                minimum: 0,
                maximum: 100,
              },
            },
            required: [
              'type',
              'x_min_percent',
              'y_min_percent',
              'x_max_percent',
              'y_max_percent',
            ],
          },
        },
        scores: {
          type: 'array',
          description: 'Array of question scores',
          items: {
            type: 'object',
            description: 'Question score information',
            properties: {
              questionNumber: {
                oneOf: [{ type: 'number' }, { type: 'string' }],
                description:
                  'Question number (can be number or string for Chinese question numbers)',
              },
              score: {
                type: 'number',
                description: 'Score value',
                minimum: 0,
              },
            },
            required: ['questionNumber', 'score'],
          },
        },
        answers: {
          type: 'object',
          description:
            'Standard answers (priority: blank sheet > answer images)',
          properties: {
            regions: {
              type: 'array',
              description: 'Array of region answer results',
              items: {
                type: 'object',
                description: 'Region answer recognition result',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['choice', 'essay'],
                    description: 'Question type',
                  },
                  region: {
                    type: 'object',
                    description: 'Original region information',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['choice', 'essay'],
                      },
                      x_min_percent: {
                        type: 'number',
                        minimum: 0,
                        maximum: 100,
                      },
                      y_min_percent: {
                        type: 'number',
                        minimum: 0,
                        maximum: 100,
                      },
                      x_max_percent: {
                        type: 'number',
                        minimum: 0,
                        maximum: 100,
                      },
                      y_max_percent: {
                        type: 'number',
                        minimum: 0,
                        maximum: 100,
                      },
                    },
                    required: [
                      'type',
                      'x_min_percent',
                      'y_min_percent',
                      'x_max_percent',
                      'y_max_percent',
                    ],
                  },
                  questions: {
                    type: 'array',
                    description:
                      'Recognized answers for all questions in this region, including sub-questions',
                    items: {
                      type: 'object',
                      description: 'Question answer',
                      properties: {
                        question_number: {
                          oneOf: [{ type: 'number' }, { type: 'string' }],
                          description:
                            'Question number. Use number for regular questions (e.g., 1, 2, 13, 21). Use string for sub-questions (e.g., "13(1)", "13(2)", "21(1)", "21(2)")',
                        },
                        answer: {
                          type: 'string',
                          description:
                            'Answer content (A/B/C/D for choice, text for essay)',
                        },
                      },
                      required: ['question_number', 'answer'],
                    },
                  },
                },
                required: ['type', 'region', 'questions'],
              },
            },
          },
          required: ['regions'],
        },
      },
      required: ['regions', 'scores', 'answers'],
    };
  }

  /**
   * Get the ChatOpenAI model instance
   */
  getModel(): ChatOpenAI {
    return this.model;
  }

  /**
   * Get the recognition result JSON Schema
   */
  getSchema(): Record<string, unknown> {
    return this.recognitionResultSchema;
  }
}
