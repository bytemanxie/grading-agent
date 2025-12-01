/**
 * Grading Module
 * 批改模块
 */

import { Module } from '@nestjs/common';

import { RecognitionModule } from '../recognition/recognition.module';

import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';
import { CallbackService } from './services/callback.service';
import { ScoreCalculationService } from './services/score-calculation.service';

@Module({
  imports: [RecognitionModule],
  controllers: [GradingController],
  providers: [GradingService, ScoreCalculationService, CallbackService],
  exports: [GradingService],
})
export class GradingModule {}
