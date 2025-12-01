/**
 * Recognition Module
 * 识别模块
 */

import { Module } from '@nestjs/common';

import { AnswerRecognitionService } from '../services/answer-recognition.service';
import { ImageCropService } from '../services/image-crop.service';
import { QwenVLService } from '../services/qwen-vl.service';

import { RecognitionController } from './recognition.controller';
import { RecognitionService } from './recognition.service';

@Module({
  controllers: [RecognitionController],
  providers: [
    RecognitionService,
    QwenVLService,
    AnswerRecognitionService,
    ImageCropService,
  ],
  exports: [RecognitionService],
})
export class RecognitionModule {}
