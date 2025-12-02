/**
 * Response types for answer recognition
 * 答案识别响应类型
 */

import { ApiProperty } from '@nestjs/swagger';

import { QuestionAnswer } from '../../common/types/answer';
import { QuestionRegion } from '../../common/types/region';

export class QuestionAnswerResponse implements QuestionAnswer {
  @ApiProperty({
    description:
      'Question number. Can be a number (1, 2, 3) or a string for sub-questions (e.g., "13(1)", "13(2)")',
    example: 1,
    oneOf: [{ type: 'number' }, { type: 'string' }],
  })
  question_number: number | string;

  @ApiProperty({ description: 'Answer content', example: 'A' })
  answer: string;
}

export class RegionAnswerResultResponse {
  @ApiProperty({ description: 'Question type', example: 'choice' })
  type: 'choice' | 'fill' | 'essay';

  @ApiProperty({ description: 'Original region information' })
  region: QuestionRegion;

  @ApiProperty({
    description: 'Recognized answers for all questions in this region',
    type: [QuestionAnswerResponse],
  })
  questions: QuestionAnswerResponse[];
}

export class AnswerRecognitionResponse {
  @ApiProperty({
    description: 'All region recognition results',
    type: [RegionAnswerResultResponse],
  })
  regions: RegionAnswerResultResponse[];
}
