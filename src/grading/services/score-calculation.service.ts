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
  RegionAnswerResult,
} from '../../common/types/answer';
import type {
  QuestionRegion,
  QuestionType,
  RecognitionResult,
} from '../../common/types/region';

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
   * @param blankSheetRecognition Blank sheet recognition result (contains scores for max_score)
   * @returns Score calculation result
   */
  async calculateScores(
    studentAnswers: AnswerRecognitionResponse,
    standardAnswers: AnswerRecognitionResponse,
    blankSheetRecognition: RecognitionResult,
  ): Promise<ScoreCalculationResult> {
    this.logger.log('Calculating scores using AI model...');

    // Build prompt for score calculation (includes scores from blank sheet)
    const prompt = this.buildScoreCalculationPrompt(
      studentAnswers,
      standardAnswers,
      blankSheetRecognition,
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

    // Parse model response and validate/override max_score with blankSheetRecognition.scores
    const scores = this.parseScoreResponse(content, blankSheetRecognition);

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
    blankSheetRecognition: RecognitionResult,
  ): string {
    // Format standard answers
    const standardAnswersText = this.formatAnswers(standardAnswers, '标准答案');

    // Format student answers
    const studentAnswersText = this.formatAnswers(studentAnswers, '学生答案');

    // Build scores map and text
    const scoresMap = new Map(
      blankSheetRecognition.scores.map((s) => [s.questionNumber, s.score]),
    );

    const scoresText =
      blankSheetRecognition.scores.length > 0
        ? `\n每道题的满分：\n${blankSheetRecognition.scores
            .map((s) => `第 ${s.questionNumber} 题：满分 ${s.score} 分`)
            .join('\n')}\n`
        : '';

    return `请根据标准答案中的得分点，对学生答案进行判分。

${standardAnswersText}

${studentAnswersText}

${scoresText}

请仔细对比每道题的学生答案和标准答案，根据标准答案中的得分点和上述满分进行判分。

判分要求：
1. **选择题**：答案完全正确得满分，否则 0 分
2. **填空题**：答案完全正确得满分，否则 0 分（可以适当考虑同义词或相近答案）
3. **解答题**：根据标准答案中的得分点，按点给分。如果学生答案包含了某个得分点，给予相应分数；如果缺少关键步骤或答案不完整，扣除相应分数
4. **重要**：每道题的 max_score 必须与上述满分一致

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
      lines.push(`\n【${region.type === 'choice' ? '选择题' : '解答题'}】`);

      for (const question of region.questions) {
        lines.push(`第 ${question.question_number} 题：${question.answer}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse model response to score result
   * 解析大模型返回的得分结果
   * @param content Model response content
   * @param blankSheetRecognition Blank sheet recognition result (contains scores for validation)
   * @returns Parsed score result with validated max_score
   */
  private parseScoreResponse(
    content: string,
    blankSheetRecognition: RecognitionResult,
  ): { questions: QuestionScore[] } {
    let jsonContent = content.trim();
    this.logger.debug('Parsing score response', { jsonContent });

    // Extract JSON from markdown code blocks
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    // Build scores map from blank sheet recognition
    const scoresMap = new Map(
      blankSheetRecognition.scores.map((s) => [s.questionNumber, s.score]),
    );

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

      // Validate and map questions, override max_score with blankSheetRecognition.scores if available
      const questions: QuestionScore[] = parsed.questions
        .filter((q) => {
          return (
            typeof q.question_number === 'number' &&
            typeof q.score === 'number' &&
            typeof q.max_score === 'number' &&
            q.score >= 0
          );
        })
        .map((q) => {
          // Use max_score from blankSheetRecognition.scores if available, otherwise use model's max_score
          const correctMaxScore =
            scoresMap.get(q.question_number) ?? q.max_score;

          // Validate score doesn't exceed max_score
          const validatedScore = Math.min(q.score, correctMaxScore);

          // Log warning if max_score was overridden
          if (
            scoresMap.has(q.question_number) &&
            q.max_score !== correctMaxScore
          ) {
            this.logger.warn(
              `Question ${q.question_number} max_score mismatch: model returned ${q.max_score}, using ${correctMaxScore} from blank sheet`,
            );
          }

          return {
            question_number: q.question_number,
            type: q.type || 'choice', // Default to choice if not specified
            score: validatedScore,
            max_score: correctMaxScore,
            reason: q.reason,
          };
        });

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

  /**
   * Merge multiple answer recognition results
   * 合并多张答题卡的识别结果
   * @param results Array of answer recognition results
   * @returns Merged answer recognition result
   */
  mergeAnswerRecognition(
    results: AnswerRecognitionResponse[],
  ): AnswerRecognitionResponse {
    this.logger.log(`Merging ${results.length} answer recognition results`);

    // Use a Map to track unique questions by type and question number
    const questionMap = new Map<string, QuestionAnswer>();

    for (const result of results) {
      for (const region of result.regions) {
        for (const question of region.questions) {
          const key = `${region.type}_${question.question_number}`;
          // If question already exists, keep the first one (or you could merge/override based on business logic)
          if (!questionMap.has(key)) {
            questionMap.set(key, question);
          }
        }
      }
    }

    // Group questions by type
    const questionsByType = new Map<QuestionType, QuestionAnswer[]>();

    for (const [key, question] of questionMap.entries()) {
      const rawType = key.split('_')[0] as 'choice' | 'fill' | 'essay';
      // Map 'fill' to 'essay' since we no longer have 'fill' type
      const type: QuestionType =
        rawType === 'fill' ? 'essay' : (rawType as QuestionType);
      if (!questionsByType.has(type)) {
        questionsByType.set(type, []);
      }
      questionsByType.get(type)!.push(question);
    }

    // Build merged regions
    const mergedRegions: RegionAnswerResult[] = [];

    for (const [type, questions] of questionsByType.entries()) {
      // Sort questions by question number
      questions.sort((a, b) => a.question_number - b.question_number);

      const region: QuestionRegion = {
        type,
        x_min_percent: 0,
        y_min_percent: 0,
        x_max_percent: 100,
        y_max_percent: 100,
      };

      mergedRegions.push({
        type,
        region,
        questions,
      });
    }

    // Sort regions by first question number
    mergedRegions.sort((a, b) => {
      const qA = a.questions[0]?.question_number || 0;
      const qB = b.questions[0]?.question_number || 0;
      return qA - qB;
    });

    this.logger.log(
      `Merged ${questionMap.size} unique questions into ${mergedRegions.length} regions`,
    );

    return {
      regions: mergedRegions,
    };
  }

  /**
   * Merge multiple score calculation results
   * 合并多个判分结果
   * @param results Array of score calculation results
   * @returns Merged score calculation result
   */
  mergeScoreResults(results: ScoreCalculationResult[]): ScoreCalculationResult {
    this.logger.log(`Merging ${results.length} score calculation results`);

    // Use Maps to track unique questions and scores
    const questionMap = new Map<number, QuestionScore>();
    const objectiveScoresMap = new Map<
      number,
      { score: number; max_score: number }
    >();
    const subjectiveScoresMap = new Map<
      number,
      { score: number; max_score: number }
    >();

    let totalScore = 0;

    for (const result of results) {
      // Merge questions (if duplicate question_number, keep the first one)
      for (const question of result.questions) {
        if (!questionMap.has(question.question_number)) {
          questionMap.set(question.question_number, question);
          totalScore += question.score;
        }
      }

      // Merge objective scores (if duplicate, keep the first one)
      for (const [questionNumber, scores] of Object.entries(
        result.objectiveScores,
      )) {
        const num = parseInt(questionNumber, 10);
        if (!objectiveScoresMap.has(num)) {
          objectiveScoresMap.set(num, scores);
        }
      }

      // Merge subjective scores (if duplicate, keep the first one)
      for (const [questionNumber, scores] of Object.entries(
        result.subjectiveScores,
      )) {
        const num = parseInt(questionNumber, 10);
        if (!subjectiveScoresMap.has(num)) {
          subjectiveScoresMap.set(num, scores);
        }
      }
    }

    // Convert maps to objects
    const objectiveScores: Record<
      number,
      { score: number; max_score: number }
    > = {};
    for (const [num, scores] of objectiveScoresMap.entries()) {
      objectiveScores[num] = scores;
    }

    const subjectiveScores: Record<
      number,
      { score: number; max_score: number }
    > = {};
    for (const [num, scores] of subjectiveScoresMap.entries()) {
      subjectiveScores[num] = scores;
    }

    // Sort questions by question number
    const questions = Array.from(questionMap.values()).sort(
      (a, b) => a.question_number - b.question_number,
    );

    this.logger.log(
      `Merged scores: ${questions.length} questions, total score: ${totalScore}`,
    );

    return {
      questions,
      objectiveScores,
      subjectiveScores,
      totalScore,
    };
  }
}
