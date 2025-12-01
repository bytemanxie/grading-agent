/**
 * Response types for region recognition
 * 区域识别响应类型
 */

import { ApiProperty } from '@nestjs/swagger';

import { QuestionRegion } from '../../common/types/region';

export class QuestionRegionResponse implements QuestionRegion {
  @ApiProperty({ description: 'Question type', example: 'choice' })
  type: 'choice' | 'fill' | 'essay';

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

export class RegionRecognitionResponse {
  @ApiProperty({
    description: 'Array of recognized regions',
    type: [QuestionRegionResponse],
  })
  regions: QuestionRegionResponse[];
}
