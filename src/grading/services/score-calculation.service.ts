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
  question_number: number | string; // 支持数字题号和中文题号（如"六"、"作文"）
  type: 'choice' | 'fill' | 'essay';
  score: number;
  max_score: number;
  reason?: string;
  studentAnswer?: string; // 学生答案
  standardAnswer?: string; // 标准答案
}

/**
 * Score calculation result
 * 判分结果
 */
export interface ScoreCalculationResult {
  questions: QuestionScore[];
  objectiveScores: Record<
    number | string,
    { score: number; max_score: number }
  >; // 支持数字和字符串题号
  subjectiveScores: Record<
    number | string,
    { score: number; max_score: number }
  >; // 支持数字和字符串题号
  totalScore: number;
  totalMaxScore: number; // 试卷总分（满分）
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
    // Support both number and string question numbers (e.g., Chinese question numbers)
    const objectiveScores: Record<
      number | string,
      { score: number; max_score: number }
    > = {};
    const subjectiveScores: Record<
      number | string,
      { score: number; max_score: number }
    > = {};

    let totalScore = 0;
    let totalMaxScore = 0;

    for (const questionScore of scores.questions) {
      totalScore += questionScore.score;
      totalMaxScore += questionScore.max_score;

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

    this.logger.log(
      `Score calculation completed. Total score: ${totalScore}/${totalMaxScore}`,
    );

    return {
      questions: scores.questions,
      objectiveScores,
      subjectiveScores,
      totalScore,
      totalMaxScore,
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

    // Build scores text
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

**重要：题号格式要求**
- **题号必须保持原样**：题号必须与学生答案和标准答案中的题号完全一致
- **中文题号**：如果题号是中文（如"六"、"作文"、"第一题"等），请保持原样，**不要转换为数字**（如不要将"六"转换为6，不要将"作文"理解为第6题）
- **数字题号**：如果题号是数字（如1、2、3等），则使用数字格式
- **示例**：如果题号是"六"，则返回 "question_number": "六"；如果题号是"作文"，则返回 "question_number": "作文"

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
      "question_number": "六",
      "type": "essay",
      "score": 8,
      "max_score": 10,
      "reason": "答对了部分得分点，缺少关键步骤"
    },
    {
      "question_number": "作文",
      "type": "essay",
      "score": 15,
      "max_score": 20,
      "reason": "内容完整，表达清晰"
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
          question_number: number | string;
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
            (typeof q.question_number === 'number' ||
              typeof q.question_number === 'string') &&
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
    // Also track the original region information for each question type
    const questionMap = new Map<string, QuestionAnswer>();
    const regionMap = new Map<string, QuestionRegion>();

    for (const result of results) {
      for (const region of result.regions) {
        // Store/merge region coordinates for this type (independent of questions)
        if (!regionMap.has(region.type)) {
          // First occurrence of this region type: store its coordinates
          regionMap.set(region.type, region.region);
        } else {
          // Merge coordinates if multiple pages have the same region type
          const existingRegion = regionMap.get(region.type)!;
          if (region.type === 'choice') {
            // Merge choice regions: take the union bounding box
            const mergedRegion: QuestionRegion = {
              type: 'choice',
              x_min_percent: Math.min(
                existingRegion.x_min_percent,
                region.region.x_min_percent,
              ),
              y_min_percent: Math.min(
                existingRegion.y_min_percent,
                region.region.y_min_percent,
              ),
              x_max_percent: Math.max(
                existingRegion.x_max_percent,
                region.region.x_max_percent,
              ),
              y_max_percent: Math.max(
                existingRegion.y_max_percent,
                region.region.y_max_percent,
              ),
            };
            regionMap.set(region.type, mergedRegion);
          }
          // For essay regions, keep full image coordinates (0, 0, 100, 100)
          // No need to update since essay regions already use full image coordinates
        }

        // Process questions in this region
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

    // Helper function to compare question numbers (supports number and string)
    const compareQuestionNumbers = (
      a: number | string,
      b: number | string,
    ): number => {
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
      }
      // Convert to string for comparison
      const aStr = String(a);
      const bStr = String(b);
      return aStr.localeCompare(bStr, undefined, { numeric: true });
    };

    // Build merged regions with preserved original coordinates
    const mergedRegions: RegionAnswerResult[] = [];

    for (const [type, questions] of questionsByType.entries()) {
      // Sort questions by question number
      questions.sort((a, b) =>
        compareQuestionNumbers(a.question_number, b.question_number),
      );

      // Use preserved region coordinates if available, otherwise use default full image
      const region: QuestionRegion = regionMap.get(type) || {
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
      const qA = a.questions[0]?.question_number ?? 0;
      const qB = b.questions[0]?.question_number ?? 0;
      return compareQuestionNumbers(qA, qB);
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
    // Support both number and string question numbers (e.g., Chinese question numbers)
    const questionMap = new Map<number | string, QuestionScore>();
    const objectiveScoresMap = new Map<
      number | string,
      { score: number; max_score: number }
    >();
    const subjectiveScoresMap = new Map<
      number | string,
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
      // Support both number and string question numbers
      for (const [questionNumber, scores] of Object.entries(
        result.objectiveScores,
      )) {
        // Try to parse as number, otherwise use as string
        const key: number | string = /^\d+$/.test(questionNumber)
          ? parseInt(questionNumber, 10)
          : questionNumber;
        if (!objectiveScoresMap.has(key)) {
          objectiveScoresMap.set(key, scores);
        }
      }

      // Merge subjective scores (if duplicate, keep the first one)
      // Support both number and string question numbers
      for (const [questionNumber, scores] of Object.entries(
        result.subjectiveScores,
      )) {
        // Try to parse as number, otherwise use as string
        const key: number | string = /^\d+$/.test(questionNumber)
          ? parseInt(questionNumber, 10)
          : questionNumber;
        if (!subjectiveScoresMap.has(key)) {
          subjectiveScoresMap.set(key, scores);
        }
      }
    }

    // Convert maps to objects
    // Support both number and string question numbers
    const objectiveScores: Record<
      number | string,
      { score: number; max_score: number }
    > = {};
    for (const [key, scores] of objectiveScoresMap.entries()) {
      objectiveScores[key] = scores;
    }

    const subjectiveScores: Record<
      number | string,
      { score: number; max_score: number }
    > = {};
    for (const [key, scores] of subjectiveScoresMap.entries()) {
      subjectiveScores[key] = scores;
    }

    // Sort questions by question number
    // Support both number and string question numbers
    const questions = Array.from(questionMap.values()).sort((a, b) => {
      const aNum = a.question_number;
      const bNum = b.question_number;
      // If both are numbers, compare numerically
      if (typeof aNum === 'number' && typeof bNum === 'number') {
        return aNum - bNum;
      }
      // If both are strings, compare lexicographically
      if (typeof aNum === 'string' && typeof bNum === 'string') {
        return aNum.localeCompare(bNum, 'zh-CN');
      }
      // Mixed types: numbers come before strings
      if (typeof aNum === 'number' && typeof bNum === 'string') {
        return -1;
      }
      if (typeof aNum === 'string' && typeof bNum === 'number') {
        return 1;
      }
      return 0;
    });

    // Calculate total max score from merged questions (avoid duplicate counting)
    const totalMaxScore = questions.reduce(
      (sum, question) => sum + question.max_score,
      0,
    );

    this.logger.log(
      `Merged scores: ${questions.length} questions, total score: ${totalScore}/${totalMaxScore}`,
    );

    return {
      questions,
      objectiveScores,
      subjectiveScores,
      totalScore,
      totalMaxScore,
    };
  }
}
