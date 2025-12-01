/**
 * Grading Controller
 * 批改控制器 - REST API 端点
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { GradeBatchDto } from './dto/grade-batch.dto';
import { GradingService } from './grading.service';
import { GradeBatchResponse } from './responses/grading.response';

@ApiTags('grading')
@Controller('grading')
export class GradingController {
  private readonly logger = new Logger(GradingController.name);

  constructor(private readonly gradingService: GradingService) {}

  @Post('grade-batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submit batch grading request',
    description: '提交批量批改请求，agent 会异步处理所有卷子',
  })
  @ApiBody({ type: GradeBatchDto })
  @ApiResponse({
    status: 202,
    description: 'Batch grading request accepted',
    type: GradeBatchResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async gradeBatch(@Body() dto: GradeBatchDto): Promise<GradeBatchResponse> {
    this.logger.log(
      `Received batch grading request for ${dto.sheets.length} sheets`,
    );

    // Start batch grading asynchronously (don't wait for completion)
    // The service will handle concurrency control and callbacks
    this.gradingService.gradeBatch(dto).catch((error) => {
      this.logger.error('Batch grading failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Return immediately with accepted status
    return {
      success: true,
      message: `Batch grading request accepted, processing ${dto.sheets.length} sheets`,
      submittedCount: dto.sheets.length,
    };
  }
}
