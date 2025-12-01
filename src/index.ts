/**
 * Main entry point for grading-agent
 * 试卷区域识别和答题识别主入口
 */

import 'dotenv/config';
import { promises as fs } from 'fs';
import { join } from 'path';

import type {
  AnswerRecognitionResponse,
  RegionAnswerResult,
} from './common/types/answer.js';
import type { RecognitionResult } from './common/types/region.js';
import { createAnswerRecognitionService } from './services/answer-recognition.js';
import { cropRegion } from './services/image-crop.js';
import { createQwenVLService } from './services/qwen-vl.js';

/**
 * Main function to recognize question regions and answers from exam paper
 */
async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const imageUrl =
    process.argv[2] ||
    'https://dl-exam-1353588171.cos.ap-guangzhou.myqcloud.com/data/school_18/grade_12/exam_68/stu_100025/grading_answer_sheet/100025_1.webp';

  if (!apiKey) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is required');
    console.error(
      'Please set DASHSCOPE_API_KEY in your .env file or environment',
    );
    process.exit(1);
  }

  if (!imageUrl) {
    console.error('Usage: npm run dev <image-url>');
    console.error('Example: npm run dev https://example.com/exam-paper.jpg');
    process.exit(1);
  }

  try {
    // Step 1: Recognize regions
    console.log('Step 1: Recognizing regions...');
    const regionService = createQwenVLService({
      apiKey,
      model: process.env.QWEN_VL_MODEL || 'qwen-vl-max-latest',
      baseURL:
        process.env.DASHSCOPE_BASE_URL ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    console.log(`Recognizing regions from image: ${imageUrl}`);
    const regionResult: RecognitionResult =
      await regionService.recognizeRegions(imageUrl);

    console.log(`\nFound ${regionResult.regions.length} regions:`);
    regionResult.regions.forEach((region, index) => {
      console.log(
        `  ${index + 1}. ${region.type} region (${region.x_min_percent}%, ${region.y_min_percent}% - ${region.x_max_percent}%, ${region.y_max_percent}%)`,
      );
    });

    // Step 2: Crop regions and recognize answers
    console.log('\nStep 2: Cropping regions and recognizing answers...');
    const answerService = createAnswerRecognitionService({
      apiKey,
      model: process.env.QWEN_VL_MODEL || 'qwen-vl-max-latest',
      baseURL:
        process.env.DASHSCOPE_BASE_URL ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const regionResults: RegionAnswerResult[] = [];

    // Create debug output directory
    // const debugDir = join(process.cwd(), 'debug-output');
    // try {
    //   await fs.mkdir(debugDir, { recursive: true });
    //   console.log(`Debug output directory: ${debugDir}`);
    // } catch (error) {
    //   console.warn(`Failed to create debug directory: ${error instanceof Error ? error.message : String(error)}`);
    // }

    for (let i = 0; i < regionResult.regions.length; i++) {
      const region = regionResult.regions[i];
      console.log(
        `\nProcessing region ${i + 1}/${regionResult.regions.length} (${region.type})...`,
      );

      try {
        // Crop the region (with 2% expansion by default)
        console.log(`  Cropping region (expanded by 2%)...`);
        const croppedImage = await cropRegion(imageUrl, region, 2);

        // Save cropped image to debug directory
        // const timestamp = Date.now();
        // const filename = `region-${i + 1}-${region.type}-${timestamp}.png`;
        // const filepath = join(debugDir, filename);
        // try {
        //   await fs.writeFile(filepath, croppedImage);
        //   console.log(`  Saved cropped image to: ${filepath}`);
        // } catch (saveError) {
        //   console.warn(`  Failed to save debug image: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
        // }

        // Recognize answers
        console.log(`  Recognizing answers...`);
        const questions = await answerService.recognizeAnswers(
          croppedImage,
          region.type,
          region,
        );

        console.log(`  Found ${questions.length} questions`);

        regionResults.push({
          type: region.type,
          region,
          questions,
        });
      } catch (error) {
        console.error(
          `  Error processing region ${i + 1}:`,
          error instanceof Error ? error.message : String(error),
        );
        // Continue with other regions even if one fails
        regionResults.push({
          type: region.type,
          region,
          questions: [],
        });
      }
    }

    // Step 3: Output results
    const finalResult: AnswerRecognitionResponse = {
      regions: regionResults,
    };

    console.log('\n=== Final Result ===');
    console.log(JSON.stringify(finalResult, null, 2));

    // Print summary
    const totalQuestions = regionResults.reduce(
      (sum, r) => sum + r.questions.length,
      0,
    );

    console.log(`\n=== Summary ===`);
    console.log(`Total regions: ${regionResults.length}`);
    console.log(`Total questions recognized: ${totalQuestions}`);

    regionResults.forEach((r) => {
      console.log(`\n${r.type} region:`);
      console.log(`  Questions: ${r.questions.length}`);
      r.questions.forEach((q) => {
        console.log(`    Q${q.question_number}: ${q.answer || '(empty)'}`);
      });
    });
  } catch (error) {
    console.error(
      '\nError:',
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
