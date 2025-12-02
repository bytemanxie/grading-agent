/**
 * DTO for combined recognition request (blank sheets + answers)
 * 统一识别请求 DTO（空白答题卡 + 答案）
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  IsUrl,
  IsString,
  IsOptional,
} from 'class-validator';

export class RecognizeCombinedDto {
  @ApiProperty({
    description: 'Blank answer sheet image URLs (can be multiple pages)',
    example: [
      'https://example.com/blank-sheet-1.jpg',
      'https://example.com/blank-sheet-2.jpg',
    ],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'At least one blank sheet image URL is required',
  })
  @IsUrl(
    {},
    { each: true, message: 'Each blankSheetImageUrl must be a valid URL' },
  )
  @IsString({ each: true })
  blankSheetImageUrls: string[];

  @ApiProperty({
    description: 'Answer image URLs (can be multiple pages)',
    example: [
      'https://example.com/answer-1.jpg',
      'https://example.com/answer-2.jpg',
    ],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'At least one answer image URL is required',
  })
  @IsUrl({}, { each: true, message: 'Each answerImageUrl must be a valid URL' })
  @IsString({ each: true })
  answerImageUrls: string[];

  @ApiProperty({
    description: 'Model name (optional)',
    example: 'qwen-vl-max-latest',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;
}
