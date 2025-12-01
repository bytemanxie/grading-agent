/**
 * Score Calculation Service
 * 判分服务 - 使用大模型对比学生答案和标准答案进行判分
 */

import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AnswerRecognitionResponse,
  QuestionAnswer,
} from '../../common/types/answer';

/**
 * Question score result
 * 题目得分结果
 */
export interface QuestionScore {
  question_number: number;
  type: 'choice' | 'fill' | 'essay';
  score: number;
  max_score: number;
  reason?: string;
}

/**
 * Score calculation result
 * 判分结果
 */
export interface ScoreCalculationResult {
  questions: QuestionScore[];
  objectiveScores: Record<number, { score: number; max_score: number }>;
  subjectiveScores: Record<number, { score: number; max_score: number }>;
  totalScore: number;
}

@Injectable()
export class ScoreCalculationService {
  private readonly logger = new Logger(ScoreCalculationService.name);
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
   * Calculate scores by comparing student answers with standard answers
   * 通过对比学生答案和标准答案进行判分
   * @param studentAnswers Student answer recognition result
   * @param standardAnswers Standard answer recognition result (with scoring points)
   * @returns Score calculation result
   */
  async calculateScores(
    studentAnswers: AnswerRecognitionResponse,
    standardAnswers: AnswerRecognitionResponse,
  ): Promise<ScoreCalculationResult> {
    this.logger.log('Calculating scores using AI model...');

    // Build prompt for score calculation
    const prompt = this.buildScoreCalculationPrompt(
      studentAnswers,
      standardAnswers,
    );

    const message = new HumanMessage({
      content: [
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

    // Parse model response
    const scores = this.parseScoreResponse(content);

    // Calculate objective and subjective scores
    const objectiveScores: Record<
      number,
      { score: number; max_score: number }
    > = {};
    const subjectiveScores: Record<
      number,
      { score: number; max_score: number }
    > = {};

    let totalScore = 0;

    for (const questionScore of scores.questions) {
      totalScore += questionScore.score;

      if (questionScore.type === 'choice' || questionScore.type === 'fill') {
        objectiveScores[questionScore.question_number] = {
          score: questionScore.score,
          max_score: questionScore.max_score,
        };
      } else if (questionScore.type === 'essay') {
        subjectiveScores[questionScore.question_number] = {
          score: questionScore.score,
          max_score: questionScore.max_score,
        };
      }
    }

    this.logger.log(`Score calculation completed. Total score: ${totalScore}`);

    return {
      questions: scores.questions,
      objectiveScores,
      subjectiveScores,
      totalScore,
    };
  }

  /**
   * Build prompt for score calculation
   * 构建判分 prompt
   */
  private buildScoreCalculationPrompt(
    studentAnswers: AnswerRecognitionResponse,
    standardAnswers: AnswerRecognitionResponse,
  ): string {
    // Format standard answers
    const standardAnswersText = this.formatAnswers(standardAnswers, '标准答案');

    // Format student answers
    const studentAnswersText = this.formatAnswers(studentAnswers, '学生答案');

    return `请根据标准答案中的得分点，对学生答案进行判分。

${standardAnswersText}

${studentAnswersText}

请仔细对比每道题的学生答案和标准答案，根据标准答案中的得分点进行判分。

判分要求：
1. **选择题**：答案完全正确得满分，否则 0 分
2. **填空题**：答案完全正确得满分，否则 0 分（可以适当考虑同义词或相近答案）
3. **解答题**：根据标准答案中的得分点，按点给分。如果学生答案包含了某个得分点，给予相应分数；如果缺少关键步骤或答案不完整，扣除相应分数

请返回 JSON 格式，包含每道题的得分：
\`\`\`json
{
  "questions": [
    {
      "question_number": 1,
      "type": "choice",
      "score": 5,
      "max_score": 5,
      "reason": "答案完全正确"
    },
    {
      "question_number": 2,
      "type": "essay",
      "score": 8,
      "max_score": 10,
      "reason": "答对了部分得分点，缺少关键步骤"
    }
  ]
}
\`\`\`

请直接返回 JSON，不要包含其他文字说明。`;
  }

  /**
   * Format answers for prompt
   * 格式化答案用于 prompt
   */
  private formatAnswers(
    answers: AnswerRecognitionResponse,
    label: string,
  ): string {
    const lines: string[] = [`${label}：`];

    for (const region of answers.regions) {
      lines.push(
        `\n【${region.type === 'choice' ? '选择题' : region.type === 'fill' ? '填空题' : '解答题'}】`,
      );

      for (const question of region.questions) {
        lines.push(`第 ${question.question_number} 题：${question.answer}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse model response to score result
   * 解析大模型返回的得分结果
   */
  private parseScoreResponse(content: string): { questions: QuestionScore[] } {
    let jsonContent = content.trim();
    this.logger.debug('Parsing score response', { jsonContent });

    // Extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonContent) as {
        questions?: Array<{
          question_number: number;
          type?: 'choice' | 'fill' | 'essay';
          score: number;
          max_score: number;
          reason?: string;
        }>;
      };

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error('Invalid response format: missing questions array');
      }

      // Validate and map questions
      const questions: QuestionScore[] = parsed.questions
        .filter((q) => {
          return (
            typeof q.question_number === 'number' &&
            typeof q.score === 'number' &&
            typeof q.max_score === 'number' &&
            q.score >= 0 &&
            q.score <= q.max_score
          );
        })
        .map((q) => ({
          question_number: q.question_number,
          type: q.type || 'choice', // Default to choice if not specified
          score: q.score,
          max_score: q.max_score,
          reason: q.reason,
        }));

      return { questions };
    } catch (error) {
      this.logger.error('Failed to parse score response', {
        error: error instanceof Error ? error.message : String(error),
        content,
      });
      throw new Error(
        `Failed to parse model response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
