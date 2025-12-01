/**
 * Root module
 * 根模块
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { GradingModule } from './grading/grading.module';
import { RecognitionModule } from './recognition/recognition.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    RecognitionModule,
    GradingModule,
  ],
})
export class AppModule {}
