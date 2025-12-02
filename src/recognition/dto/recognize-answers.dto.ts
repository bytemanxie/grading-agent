/**
 * DTO for answer recognition request
 * 答案识别请求 DTO
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  ArrayMinSize,
} from 'class-validator';

export class RecognizeAnswersDto {
  @ApiProperty({
    description: 'Single image URL (for backward compatibility)',
    example: 'https://example.com/answer-sheet.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: 'imageUrl must be a valid URL' })
  @IsString()
  imageUrl?: string;

  @ApiProperty({
    description: 'Multiple image URLs for batch recognition',
    example: [
      'https://example.com/answer-sheet-1.jpg',
      'https://example.com/answer-sheet-2.jpg',
    ],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'At least one image URL is required in imageUrls',
  })
  @IsUrl({}, { each: true, message: 'Each imageUrl must be a valid URL' })
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiProperty({
    description: 'Model name (optional)',
    example: 'qwen-vl-max-latest',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;
}
