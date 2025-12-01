/**
 * DTO for batch grading request
 * 批量批改请求 DTO
 */

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsString,
  IsUrl,
  ValidateNested,
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
    description: 'Student answer sheet image URL',
    example: 'https://example.com/student-sheet.jpg',
  })
  @IsUrl({}, { message: 'studentSheetImageUrl must be a valid URL' })
  @IsString()
  studentSheetImageUrl: string;
}

/**
 * Batch grading request DTO
 * 批量批改请求 DTO
 */
export class GradeBatchDto {
  @ApiProperty({
    description: 'Blank sheet recognition result (shared by all sheets)',
    example: {
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
  })
  @IsObject()
  blankSheetRecognition: RecognitionResult;

  @ApiProperty({
    description:
      'Answer recognition result with scoring points (shared by all sheets)',
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
  })
  @IsObject()
  answerRecognition: AnswerRecognitionResponse;

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
        studentSheetImageUrl: 'https://example.com/student-sheet-1.jpg',
      },
      {
        gradingSheetId: 124,
        studentSheetImageUrl: 'https://example.com/student-sheet-2.jpg',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetInfoDto)
  sheets: SheetInfoDto[];
}
