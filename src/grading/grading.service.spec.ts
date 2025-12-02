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
  return jest.fn((_concurrency: number) => {
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
    // 空白答题卡 URL 数组（按页面顺序）
    const answerSheetUrls = [
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/blank_sheet/1764643620193-lynxnamc.webp',
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/blank_sheet/1764643620563-6zjkbglt.webp',
    ];

    // 标准答案 URL 数组（按页面顺序）
    const answerKeyUrls = [
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/standard_answer/1764643620856-a34gdd36.webp',
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/standard_answer/1764643621109-4xl4neuh.webp',
    ];

    // 空白答题卡识别结果（按 answerSheetUrls 顺序）
    const blankSheetRecognitionData = {
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/blank_sheet/1764643620193-lynxnamc.webp':
        {
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
        },
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/blank_sheet/1764643620563-6zjkbglt.webp':
        {
          scores: [{ score: 50, questionNumber: 6 }],
          regions: [],
        },
    };

    // 标准答案识别结果（按 answerKeyUrls 顺序）
    const answerRecognitionData = {
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/standard_answer/1764643620856-a34gdd36.webp':
        {
          regions: [
            {
              type: 'essay',
              region: {
                type: 'essay',
                x_max_percent: 100,
                x_min_percent: 0,
                y_max_percent: 100,
                y_min_percent: 0,
              },
              questions: [
                {
                  answer: 'qiáo（1分）  bǐng（1分）  "章"改为"彰"（1分）',
                  question_number: 1,
                },
                {
                  answer: '"振聋发聩"改成"震耳欲聋"（2分）',
                  question_number: 2,
                },
                {
                  answer:
                    '（1）①示例：了解活动的主题意义。（2分） ②示例：张老师，您好。请问这次活动为什么以"诚信进校园"为主题呢？ 示例：张老师，您好。请问"诚信进校园"与我们每位同学之间有什么联系呢？（2分）（言之有理即可）\n（2）① 一言既出驷马难追、徙木立信等（1分）（言之有理即可）\n② 丙（1分）"就能"改成"才能"。（1分）\n（3）这张票左边为鼎，寓意着一言九鼎，说到做到，是诚信的表现；右边是写有"诚信"的卷轴，点明主题，一目了然。（3分）',
                  question_number: 4,
                },
                {
                  answer:
                    '①树树皆秋色（1分）②山山唯落晖（1分）③日暮乡关何处是（1分）④征蓬出汉塞（1分）⑤归雁入胡天（1分）⑥鸢飞戾天者（1分）（错一个字不得分）',
                  question_number: 5,
                },
                {
                  answer: '门（1分） 眼泪（1分） 考虑，想到（1分） 到（1分）',
                  question_number: 7,
                },
                {
                  answer: '昔常不信其言/以今观之/殆有甚者（2分）',
                  question_number: 8,
                },
                {
                  answer:
                    '①月光照在庭院的地面上好像积水一般澄澈透明，水中的水藻、荇纵横交错，大概是竹子和柏树的影子。（2分）\n②我常常摒退身边的人，亲自进入村庄。（2分）',
                  question_number: 9,
                },
                {
                  answer:
                    '【甲】诗作为一首送别诗，无传统赠别诗的伤感，以勉励代替愁绪，体现苏轼豁达乐观的人生哲学；（2分）作者在写作【乙】文时，是被贬黄州期间，正是人生失意之时，但他"欣然"邀友赏月，透露出豁达乐观的天性；（1分）【丙】文中作者深入民间，体察民情，当百姓因苦于官府催缴欠债难于活命而落泪时，"亦不觉流涕"，并将情况如实上奏朝廷，以期朝廷能施仁政，解百姓之忧，是"黎民百姓"的"好朋友"。（2分）',
                  question_number: 10,
                },
                {
                  answer:
                    '（1）明清晰传递评论者的态度和观点；紧扣目标读者关心的社会议题、唤起读者的共情与思考；语言凝练，富有感染力，运用修辞增强表现力，快速抓住读者注意力思。（据此言之有理即可。）（3分）',
                  question_number: 13,
                },
                {
                  answer:
                    '虽然内容细碎，但却真实地展现了樊锦诗初到敦煌时生活的艰苦；（1分）这些细节能让读者更真切地感受到她坚守敦煌的不易，表现她对敦煌的热爱与责任感，（1分）符合典型事件的特点，对',
                  question_number: 14,
                },
              ],
            },
            {
              type: 'choice',
              region: {
                type: 'choice',
                x_max_percent: 50,
                x_min_percent: 4.5,
                y_max_percent: 37,
                y_min_percent: 27.5,
              },
              questions: [
                { answer: 'B', question_number: 3 },
                { answer: 'B', question_number: 6 },
                { answer: 'D', question_number: 11 },
                { answer: 'C', question_number: 12 },
              ],
            },
          ],
        },
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_undefined/grade_undefined/exam_70/standard_answer/1764643621109-4xl4neuh.webp':
        {
          regions: [
            {
              type: 'essay',
              region: {
                type: 'essay',
                x_max_percent: 100,
                x_min_percent: 0,
                y_max_percent: 100,
                y_min_percent: 0,
              },
              questions: [
                {
                  answer:
                    '选择 A 句，这一句话以樊锦诗自己的话，体现了她体贴他人、谦虚低调、无私奉献的精神品质。拉近读者与樊锦诗的距离，更容易产生情感上的共鸣。选择 B 句，这一句话以听众的话，侧面表现了樊锦诗长期扎根敦煌而产生的变化，体现了她的奉献精神，同时借他人之口来体现樊锦诗的形象，更具有说服力。',
                  question_number: 15,
                },
                {
                  answer:
                    '"锦"本义是绚丽的织品，象征樊锦诗的人生如锦缎般精彩，她放弃都市繁华，在敦煌创造了考古研究的成就，守护了敦煌的辉煌，人生价值绚丽夺目。"诗"本义是心志的流露，象征樊锦诗的精神如诗歌般动人，她对敦煌的热爱、坚守与责任感，是她内心心志的体现。',
                  question_number: 16,
                },
                {
                  answer:
                    'A.藤野先生：藤野先生认真批改鲁迅的讲义，对来自弱国的学生给予平等的对待和真诚的指导，是一位治学严谨、认真负责、关心学生成长的好老师；樊锦诗在敦煌研究保护近四十年，她在艰苦环境中坚守的坚韧执着，具有高度的责任感；他们都在自己的工作领域都展现出高度的专注和责任感。\nB.居里夫人：居里夫人不顾放射性物质对身体的危害，全身心投入到镭的研究中表现出对科学研究的热爱、坚韧不拔的毅力、在艰苦条件下的奉献精神；樊锦诗放弃了繁华的城市生活，毅然决然地选择了前往环境艰苦恶劣的敦煌研究院工作，在敦煌艰苦环境下的坚守；她们在对事业的执着追求、不畏艰难的奉献是美丽的。',
                  question_number: 17,
                },
                {
                  answer:
                    '(1) 示例：温和有礼、精通多国语言、博学多才、自信热情等。\n(2) 示例：这是第一部客观向世界报道红色中国的作品，斯诺秉持"拿出证据，眼见为实"的采访原则，结合自身的亲身采访经历，坚持用事实说话；以饱含热情的笔触，极具人文关怀地投入到对中国社会的关切中，善于捕捉细节，人物刻画生动；这部作品还展示了中国的光明和希望，给全世界人民带来反法西斯斗争的信心和力量，传递的精神力量激励了一代又一代人。',
                  question_number: 18,
                },
              ],
            },
          ],
        },
    };

    // 将对象格式转换为数组格式（按 URL 顺序）
    const blankSheetRecognition: RecognitionResult[] = answerSheetUrls.map(
      (url) => blankSheetRecognitionData[url],
    );

    const answerRecognition: AnswerRecognitionResponse[] = answerKeyUrls.map(
      (url) => answerRecognitionData[url],
    );

    // 学生答卷图片 URL（从环境变量获取或使用测试URL）
    const studentSheetImageUrls = [
      process.env.TEST_STUDENT_SHEET_URL ||
        'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_18/grade_13/exam_70/stu_002/grading_answer_sheet/002_1.webp',
      'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_18/grade_13/exam_70/stu_002/grading_answer_sheet/002_2.webp',
    ];

    // 回调 URL（从环境变量获取或使用 webhook.site）
    const callbackUrl =
      process.env.TEST_CALLBACK_URL || 'https://agent.free.beeceptor.com';

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
    // eslint-disable-next-line no-console
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
