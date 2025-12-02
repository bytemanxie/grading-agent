/**
 * Grading Service Integration Test
 * 批改服务集成测试 - 测试完整的批改流程
 */

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import type { AnswerRecognitionResponse } from '../common/types/answer';
import type { RecognitionResult } from '../common/types/region';
import configuration from '../config/configuration';

import type { GradeBatchDto } from './dto/grade-batch.dto';
import { GradingModule } from './grading.module';
import { GradingService } from './grading.service';
// Mock p-limit before importing GradingService to avoid ES module issues
jest.mock('p-limit', () => {
  return jest.fn((concurrency: number) => {
    return (fn: () => Promise<any>) => fn();
  });
});
describe('GradingService Integration Test', () => {
  let service: GradingService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        GradingModule,
      ],
    }).compile();

    service = module.get<GradingService>(GradingService);
  });

  afterAll(async () => {
    await module.close();
  });

  /**
   * 测试批改卷子的完整流程
   * 注意：这是一个集成测试，需要真实的 API key 和图片 URL
   */
  // eslint-disable-next-line no-console
  it('should grade batch sheets successfully', async () => {
    // 准备测试数据 - 基于实际数据结构
    // 空白答题卡识别结果（按 answerSheetUrls 顺序）
    const blankSheetRecognition: RecognitionResult[] = [
      {
        regions: [
          {
            type: 'choice',
            x_min_percent: 5,
            y_min_percent: 30,
            x_max_percent: 47,
            y_max_percent: 43,
          },
        ],
        scores: [
          { questionNumber: 1, score: 3 },
          { questionNumber: 2, score: 3 },
          { questionNumber: 3, score: 3 },
          { questionNumber: 4, score: 3 },
          { questionNumber: 5, score: 3 },
          { questionNumber: 6, score: 3 },
          { questionNumber: 7, score: 3 },
          { questionNumber: 8, score: 3 },
          { questionNumber: 9, score: 3 },
          { questionNumber: 10, score: 3 },
          { questionNumber: 11, score: 3 },
          { questionNumber: 12, score: 3 },
          { questionNumber: 13, score: 2 },
          { questionNumber: 14, score: 2 },
          { questionNumber: 15, score: 2 },
          { questionNumber: 16, score: 2 },
          { questionNumber: 17, score: 2 },
          { questionNumber: 18, score: 2 },
          { questionNumber: 19, score: 2 },
          { questionNumber: 20, score: 2 },
          { questionNumber: 21, score: 8 },
          { questionNumber: 22, score: 10 },
        ],
      },
      {
        regions: [],
        scores: [
          { questionNumber: 24, score: 9 },
          { questionNumber: 25, score: 10 },
          { questionNumber: 26, score: 10 },
        ],
      },
    ];

    // 标准答案识别结果（按 answerSheetUrls 顺序，每页对应相同的标准答案）
    const answerRecognition: AnswerRecognitionResponse[] = [
      {
        regions: [
          {
            type: 'choice',
            region: {
              type: 'choice',
              x_min_percent: 0,
              y_min_percent: 0,
              x_max_percent: 100,
              y_max_percent: 100,
            },
            questions: [
              { question_number: 1, answer: 'A' },
              { question_number: 2, answer: 'B' },
              { question_number: 3, answer: 'C' },
              { question_number: 4, answer: 'A' },
              { question_number: 5, answer: 'D' },
              { question_number: 6, answer: 'C' },
              { question_number: 7, answer: 'A' },
              { question_number: 8, answer: 'C' },
              { question_number: 9, answer: 'A' },
              { question_number: 10, answer: 'C' },
              { question_number: 11, answer: 'B' },
              { question_number: 12, answer: 'D' },
            ],
          },
          {
            type: 'essay',
            region: {
              type: 'essay',
              x_min_percent: 0,
              y_min_percent: 0,
              x_max_percent: 100,
              y_max_percent: 100,
            },
            questions: [
              { question_number: 13, answer: '1.20 -8 398' },
              { question_number: 14, answer: '电动自行车/小明/小明妈妈 静止' },
              { question_number: 15, answer: '次声波 信息' },
              { question_number: 16, answer: '音色 响度' },
              { question_number: 17, answer: '270 24' },
            ],
          },
          {
            type: 'essay',
            region: {
              type: 'essay',
              x_min_percent: 0,
              y_min_percent: 0,
              x_max_percent: 100,
              y_max_percent: 100,
            },
            questions: [
              {
                question_number: 18,
                answer: '(1) 振动 转换法\n(2)在桌面上撒一些纸屑\n(3)空气中',
              },
              {
                question_number: 19,
                answer: '(1) 自下而上 秒表\n(2) 晶体\n(3)固液共存态',
              },
              {
                question_number: 20,
                answer: '(1) v = s/t\n(2)减小\n(3) 0.16\n(4)偏大',
              },
              { question_number: 21, answer: '(1)120\n(2)0.5h\n(3)120km' },
              { question_number: 22, answer: '(1)20h\n(2)600m\n(3)39s' },
            ],
          },
        ],
      },
      {
        // 第二页的标准答案（如果有的话，这里使用相同的标准答案）
        regions: [],
      },
    ];

    // 学生答卷图片 URL（从环境变量获取或使用测试URL）
    const studentSheetImageUrls = [
      process.env.TEST_STUDENT_SHEET_URL ||
        'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_18/grade_10/exam_71/stu_009/grading_answer_sheet/009_1.webp',
    ];

    // 回调 URL（从环境变量获取或使用 webhook.site）
    const callbackUrl =
      process.env.TEST_CALLBACK_URL || 'https://webhook.site/your-unique-url';

    const dto: GradeBatchDto = {
      blankSheetRecognition,
      answerRecognition,
      callbackUrl,
      sheets: [
        {
          gradingSheetId: 123,
          studentSheetImageUrls,
        },
      ],
    };

    // eslint-disable-next-line no-console
    console.log('开始批改测试...');
    // eslint-disable-next-line no-console
    console.log('测试数据:', JSON.stringify(dto, null, 2));
    // eslint-disable-next-line no-console
    console.log('注意：请确保设置了以下环境变量：');
    // eslint-disable-next-line no-console
    console.log('  - DASHSCOPE_API_KEY: DashScope API Key');
    // eslint-disable-next-line no-console
    console.log('  - TEST_STUDENT_SHEET_URL: 学生答卷图片 URL（可选）');
    // eslint-disable-next-line no-console
    console.log(
      '  - TEST_CALLBACK_URL: 回调 URL（可选，默认使用 webhook.site）',
    );
    // eslint-disable-next-line no-console
    console.log('');

    // 执行批改
    const startTime = Date.now();
    const result = await service.gradeBatch(dto);
    const duration = Date.now() - startTime;

    // eslint-disable-next-line no-console
    console.log('批改完成！');
    // eslint-disable-next-line no-console
    console.log('结果:', JSON.stringify(result, null, 2));
    // eslint-disable-next-line no-console
    console.log(`耗时: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    // eslint-disable-next-line no-console
    console.log('');
    console.log(result);

    // 验证结果
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.submittedCount).toBe(1);
    expect(result.message).toContain('Batch grading request accepted');

    // eslint-disable-next-line no-console
    console.log('✅ 测试通过！批改请求已成功提交。');
    // eslint-disable-next-line no-console
    console.log('📝 请检查回调 URL 以查看批改结果详情。');
  }, 300000); // 5 分钟超时
});
