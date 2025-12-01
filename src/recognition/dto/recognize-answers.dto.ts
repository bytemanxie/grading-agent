/**
 * DTO for answer recognition request
 * 答案识别请求 DTO
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class RecognizeAnswersDto {
  @ApiProperty({
    description: 'Image URL of the answer sheet',
    example: 'https://example.com/answer-sheet.jpg',
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
