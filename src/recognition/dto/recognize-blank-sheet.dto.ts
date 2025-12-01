/**
 * DTO for blank sheet recognition request
 * 空白答题卡识别请求 DTO
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class RecognizeBlankSheetDto {
  @ApiProperty({
    description: 'Image URL of the blank answer sheet',
    example: 'https://example.com/blank-answer-sheet.jpg',
  })
  @IsUrl({}, { message: 'imageUrl must be a valid URL' })
  @IsString()
  imageUrl: string;

  @ApiProperty({
    description: 'Model name (optional)',
    example: 'qwen-vl-max-latest',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;
}
