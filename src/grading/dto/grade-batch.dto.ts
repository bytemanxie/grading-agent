/**
 * DTO for batch grading request
 * 批量批改请求 DTO
 */

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsUrl,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

import type { AnswerRecognitionResponse } from '../../common/types/answer';
import type { RecognitionResult } from '../../common/types/region';

/**
 * Sheet information for grading
 * 需要批改的卷子信息
 */
export class SheetInfoDto {
  @ApiProperty({
    description: 'GradingSheet ID',
    example: 123,
  })
  gradingSheetId: number;

  @ApiProperty({
    description: 'Student answer sheet image URLs (ordered by page number)',
    example: [
      'https://example.com/student-sheet-1.jpg',
      'https://example.com/student-sheet-2.jpg',
    ],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one image URL is required' })
  @IsUrl(
    {},
    { each: true, message: 'Each studentSheetImageUrl must be a valid URL' },
  )
  @IsString({ each: true })
  studentSheetImageUrls: string[];
}

/**
 * Batch grading request DTO
 * 批量批改请求 DTO
 */
export class GradeBatchDto {
  @ApiProperty({
    description:
      'Blank sheet recognition results (ordered by page number, shared by all sheets)',
    example: [
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
        scores: [
          { questionNumber: 1, score: 2 },
          { questionNumber: 2, score: 2 },
        ],
      },
    ],
    type: 'array',
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'At least one blank sheet recognition is required',
  })
  @ValidateNested({ each: true })
  @Type(() => Object)
  blankSheetRecognition: RecognitionResult[];

  @ApiProperty({
    description:
      'Answer recognition results with scoring points. Can be a single merged result (all pages combined) or an array (ordered by page number, shared by all sheets).',
    example: {
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
          ],
        },
      ],
    },
    oneOf: [
      { $ref: '#/components/schemas/AnswerRecognitionResponse' },
      {
        type: 'array',
        items: { $ref: '#/components/schemas/AnswerRecognitionResponse' },
      },
    ],
  })
  answerRecognition: AnswerRecognitionResponse | AnswerRecognitionResponse[];

  @ApiProperty({
    description:
      'Callback URL for receiving grading results (shared by all sheets)',
    example: 'https://dl-front.example.com/api/grading/receive-answers',
  })
  @IsUrl({}, { message: 'callbackUrl must be a valid URL' })
  @IsString()
  callbackUrl: string;

  @ApiProperty({
    description: 'Array of sheets to grade',
    type: [SheetInfoDto],
    example: [
      {
        gradingSheetId: 123,
        studentSheetImageUrls: [
          'https://example.com/student-sheet-1.jpg',
          'https://example.com/student-sheet-2.jpg',
        ],
      },
      {
        gradingSheetId: 124,
        studentSheetImageUrls: ['https://example.com/student-sheet-3.jpg'],
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetInfoDto)
  sheets: SheetInfoDto[];
}
