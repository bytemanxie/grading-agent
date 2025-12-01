/**
 * Response types for batch grading
 * 批量批改响应类型
 */

import { ApiProperty } from '@nestjs/swagger';

/**
 * Batch grading response
 * 批量批改响应
 */
export class GradeBatchResponse {
  @ApiProperty({
    description: 'Whether the batch grading request was accepted',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Batch grading request accepted, processing 10 sheets',
  })
  message?: string;

  @ApiProperty({
    description: 'Number of sheets submitted for grading',
    example: 10,
  })
  submittedCount?: number;
}
