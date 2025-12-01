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
    // 准备测试数据
    const blankSheetRecognition: RecognitionResult[] = [
      {
        regions: [
          {
            type: 'choice',
            x_min_percent: 10,
            y_min_percent: 20,
            x_max_percent: 90,
            y_max_percent: 80,
          },
        ],
      },
    ];

    const answerRecognition: AnswerRecognitionResponse[] = [
      {
        regions: [
          {
            type: 'choice',
            region: {
              type: 'choice',
              x_min_percent: 10,
              y_min_percent: 20,
              x_max_percent: 90,
              y_max_percent: 80,
            },
            questions: [
              {
                question_number: 1,
                answer: 'A',
              },
              {
                question_number: 2,
                answer: 'B',
              },
              {
                question_number: 3,
                answer: 'C',
              },
            ],
          },
        ],
      },
    ];

    // TODO: 替换为真实的学生答卷图片 URL
    // 示例：['https://example.com/student-sheet-1.jpg']
    const studentSheetImageUrls = [
      process.env.TEST_STUDENT_SHEET_URL ||
        'https://example.com/student-sheet-1.jpg',
    ];

    // TODO: 替换为真实的回调 URL 或使用测试服务器
    // 可以使用 https://webhook.site 或创建一个简单的测试服务器
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
