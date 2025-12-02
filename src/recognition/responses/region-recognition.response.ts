/**
 * Response types for region recognition
 * 区域识别响应类型
 */

import { ApiProperty } from '@nestjs/swagger';

import { QuestionRegion, QuestionScore } from '../../common/types/region';

import { AnswerRecognitionResponse } from './answer-recognition.response';

export class QuestionRegionResponse implements QuestionRegion {
  @ApiProperty({ description: 'Question type', example: 'choice' })
  type: 'choice' | 'essay';

  @ApiProperty({
    description: 'Minimum X coordinate as percentage',
    example: 5.0,
  })
  x_min_percent: number;

  @ApiProperty({
    description: 'Minimum Y coordinate as percentage',
    example: 10.0,
  })
  y_min_percent: number;

  @ApiProperty({
    description: 'Maximum X coordinate as percentage',
    example: 95.0,
  })
  x_max_percent: number;

  @ApiProperty({
    description: 'Maximum Y coordinate as percentage',
    example: 30.0,
  })
  y_max_percent: number;
}

export class QuestionScoreResponse implements QuestionScore {
  @ApiProperty({
    description:
      'Question number (can be a number like 1, 2, 3 or a string like "六", "作文", "第一题")',
    example: 1,
    oneOf: [{ type: 'number' }, { type: 'string' }],
  })
  questionNumber: number | string;

  @ApiProperty({
    description: 'Score value',
    example: 2,
  })
  score: number;
}

export class RegionRecognitionResponse {
  @ApiProperty({
    description: 'Array of recognized regions',
    type: [QuestionRegionResponse],
  })
  regions: QuestionRegionResponse[];

  @ApiProperty({
    description: 'Array of question scores',
    type: [QuestionScoreResponse],
  })
  scores: QuestionScoreResponse[];

  @ApiProperty({
    description: 'Standard answers (priority: blank sheet > answer images)',
    type: AnswerRecognitionResponse,
    required: false,
  })
  answers?: AnswerRecognitionResponse;
}
