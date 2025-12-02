/**
 * Recognition Module
 * 识别模块
 */

import { Module } from '@nestjs/common';

import { RecognitionController } from './recognition.controller';
import { RecognitionService } from './recognition.service';
import { AnswerRecognitionService } from './services/answer-recognition.service';
import { ImageCropService } from './services/image-crop.service';
import { ImageValidatorService } from './services/image-validator.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { QwenVLModelService } from './services/qwen-vl-model.service';
import { QwenVLService } from './services/qwen-vl.service';
import { ResponseParserService } from './services/response-parser.service';

@Module({
  controllers: [RecognitionController],
  providers: [
    RecognitionService,
    QwenVLService,
    QwenVLModelService,
    PromptBuilderService,
    ResponseParserService,
    ImageValidatorService,
    AnswerRecognitionService,
    ImageCropService,
  ],
  exports: [RecognitionService],
})
export class RecognitionModule {}
