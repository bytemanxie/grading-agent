/**
 * Recognition Controller
 * 识别控制器 - REST API 端点
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { RecognizeAnswersDto } from './dto/recognize-answers.dto';
import { RecognizeBlankSheetDto } from './dto/recognize-blank-sheet.dto';
import { RecognizeCombinedDto } from './dto/recognize-combined.dto';
import { RecognitionService } from './recognition.service';
import { AnswerRecognitionResponse } from './responses/answer-recognition.response';
import { RegionRecognitionResponse } from './responses/region-recognition.response';

@ApiTags('recognition')
@Controller('recognition')
export class RecognitionController {
  private readonly logger = new Logger(RecognitionController.name);

  constructor(private readonly recognitionService: RecognitionService) {}

  @Post('blank-sheet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recognize regions from blank answer sheet',
    description: '识别空白答题卡中的答题区域（选择题、填空题、解答题区域）',
  })
  @ApiBody({ type: RecognizeBlankSheetDto })
  @ApiResponse({
    status: 200,
    description: 'Regions recognized successfully',
    type: RegionRecognitionResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or image size exceeds 10MB limit',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async recognizeBlankSheet(
    @Body() dto: RecognizeBlankSheetDto,
  ): Promise<RegionRecognitionResponse> {
    this.logger.log(`Recognize blank sheet request: ${dto.imageUrl}`);
    const result = await this.recognitionService.recognizeBlankSheet(
      dto.imageUrl,
    );
    return result;
  }

  @Post('answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recognize answers from answer sheet image(s)',
    description:
      '识别答案图片中的所有答案（整张图片识别，不需要区域分割）。支持单张或批量识别。',
  })
  @ApiBody({ type: RecognizeAnswersDto })
  @ApiResponse({
    status: 200,
    description:
      'Answers recognized successfully (merged result from all images)',
    type: AnswerRecognitionResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or image size exceeds 10MB limit',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async recognizeAnswers(
    @Body() dto: RecognizeAnswersDto,
  ): Promise<AnswerRecognitionResponse> {
    // Support both single and batch recognition
    if (dto.imageUrls && dto.imageUrls.length > 0) {
      this.logger.log(
        `Recognize answers batch request: ${dto.imageUrls.length} images (merged result)`,
      );
      const result = await this.recognitionService.recognizeAnswersBatch(
        dto.imageUrls,
      );
      return result;
    } else if (dto.imageUrl) {
      this.logger.log(`Recognize answers request: ${dto.imageUrl}`);
      const result = await this.recognitionService.recognizeAnswers(
        dto.imageUrl,
      );
      return result;
    } else {
      throw new BadRequestException(
        'Either imageUrl or imageUrls must be provided',
      );
    }
  }

  @Post('combined')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recognize regions and scores from blank sheets and answers combined',
    description:
      '统一识别：同时分析空白答题卡和答案图片，识别答题区域和各题分数、总分。支持多张空白答题卡和多张答案图片。',
  })
  @ApiBody({ type: RecognizeCombinedDto })
  @ApiResponse({
    status: 200,
    description:
      'Regions and scores recognized successfully from combined images',
    type: RegionRecognitionResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or image size exceeds 10MB limit',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async recognizeCombined(
    @Body() dto: RecognizeCombinedDto,
  ): Promise<RegionRecognitionResponse> {
    this.logger.log(
      `Recognize combined request: ${dto.blankSheetImageUrls.length} blank sheets, ${dto.answerImageUrls.length} answer images`,
    );
    const result = await this.recognitionService.recognizeCombined(
      dto.blankSheetImageUrls,
      dto.answerImageUrls,
    );
    return result;
  }
}
