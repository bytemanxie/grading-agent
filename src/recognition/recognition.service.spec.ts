/**
 * Recognition Service Integration Test
 * 识别服务集成测试 - 测试 recognizeStudentAnswers 函数
 */

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import type { RecognitionResult } from '../common/types/region';
import configuration from '../config/configuration';

import { RecognitionModule } from './recognition.module';
import { RecognitionService } from './recognition.service';

describe('RecognitionService - recognizeStudentAnswers', () => {
  let service: RecognitionService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        RecognitionModule,
      ],
    }).compile();

    service = module.get<RecognitionService>(RecognitionService);
  });

  afterAll(async () => {
    await module.close();
  });

  /**
   * 测试识别学生答案
   * 注意：这是一个集成测试，需要真实的 API key 和图片 URL
   */
  // eslint-disable-next-line no-console
  it('should recognize student answers successfully', async () => {
    // 准备测试数据
    // 学生答卷图片 URL（从环境变量获取或使用测试URL）
    const studentSheetImageUrl =
      process.env.TEST_STUDENT_SHEET_URL ||
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_18/grade_13/exam_70/stu_002/grading_answer_sheet/002_1.webp';

    // 空白答题卡识别结果（包含 regions 和 scores）
    const blankSheetRecognition: RecognitionResult = {
      scores: [
        { score: 3, questionNumber: 1 },
        { score: 2, questionNumber: 2 },
        { score: 2, questionNumber: 4 },
        { score: 2, questionNumber: 4 },
        { score: 1, questionNumber: 4 },
        { score: 3, questionNumber: 4 },
        { score: 6, questionNumber: 5 },
        { score: 4, questionNumber: 7 },
        { score: 2, questionNumber: 8 },
        { score: 2, questionNumber: 9 },
        { score: 2, questionNumber: 9 },
        { score: 5, questionNumber: 10 },
        { score: 3, questionNumber: 13 },
        { score: 3, questionNumber: 14 },
        { score: 2, questionNumber: 15 },
        { score: 4, questionNumber: 16 },
        { score: 4, questionNumber: 17 },
        { score: 2, questionNumber: 18 },
        { score: 4, questionNumber: 18 },
      ],
      regions: [
        {
          type: 'choice',
          x_max_percent: 50,
          x_min_percent: 4.5,
          y_max_percent: 37,
          y_min_percent: 27.5,
        },
      ],
    };

    // eslint-disable-next-line no-console
    console.log('='.repeat(80));
    // eslint-disable-next-line no-console
    console.log('开始测试 recognizeStudentAnswers...');
    // eslint-disable-next-line no-console
    console.log('='.repeat(80));
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('📋 输入参数:');
    // eslint-disable-next-line no-console
    console.log('  学生答卷图片 URL:', studentSheetImageUrl);
    // eslint-disable-next-line no-console
    console.log('  空白答题卡识别结果:');
    // eslint-disable-next-line no-console
    console.log('    - Regions 数量:', blankSheetRecognition.regions.length);
    // eslint-disable-next-line no-console
    console.log('    - Scores 数量:', blankSheetRecognition.scores.length);
    // eslint-disable-next-line no-console
    console.log(
      '    - Regions 详情:',
      JSON.stringify(blankSheetRecognition.regions, null, 2),
    );
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('注意：请确保设置了以下环境变量：');
    // eslint-disable-next-line no-console
    console.log('  - DASHSCOPE_API_KEY: DashScope API Key');
    // eslint-disable-next-line no-console
    console.log('  - TEST_STUDENT_SHEET_URL: 学生答卷图片 URL（可选）');
    // eslint-disable-next-line no-console
    console.log('');

    // 执行识别
    const startTime = Date.now();
    const result = await service.recognizeStudentAnswers(
      studentSheetImageUrl,
      blankSheetRecognition,
    );
    const duration = Date.now() - startTime;

    // eslint-disable-next-line no-console
    console.log('='.repeat(80));
    // eslint-disable-next-line no-console
    console.log('✅ 识别完成！');
    // eslint-disable-next-line no-console
    console.log('='.repeat(80));
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`⏱️  耗时: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('📊 识别结果概览:');
    // eslint-disable-next-line no-console
    console.log('  - Regions 总数:', result.regions.length);
    // eslint-disable-next-line no-console
    console.log('');

    // 打印每个 region 的详细信息
    result.regions.forEach((region, index) => {
      // eslint-disable-next-line no-console
      console.log(`📦 Region ${index + 1}:`);
      // eslint-disable-next-line no-console
      console.log(`  类型: ${region.type}`);
      // eslint-disable-next-line no-console
      console.log(`  区域坐标:`, {
        x_min_percent: region.region.x_min_percent,
        y_min_percent: region.region.y_min_percent,
        x_max_percent: region.region.x_max_percent,
        y_max_percent: region.region.y_max_percent,
      });
      // eslint-disable-next-line no-console
      console.log(`  题目数量: ${region.questions.length}`);
      // eslint-disable-next-line no-console
      console.log('');

      // 打印每个 question 的答案
      if (region.questions.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`  📝 题目答案:`);
        region.questions.forEach((question) => {
          // eslint-disable-next-line no-console
          console.log(
            `    题号 ${question.question_number}: ${question.answer}`,
          );
        });
        // eslint-disable-next-line no-console
        console.log('');
      }
    });

    // 打印完整的 JSON 结果
    // eslint-disable-next-line no-console
    console.log('='.repeat(80));
    // eslint-disable-next-line no-console
    console.log('📄 完整识别结果 (JSON):');
    // eslint-disable-next-line no-console
    console.log('='.repeat(80));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
    // eslint-disable-next-line no-console
    console.log('');

    // 验证结果
    expect(result).toBeDefined();
    expect(result.regions).toBeDefined();
    expect(Array.isArray(result.regions)).toBe(true);

    // eslint-disable-next-line no-console
    console.log('✅ 测试通过！识别结果已成功返回。');
  }, 300000); // 5 分钟超时
});
