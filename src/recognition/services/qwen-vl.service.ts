/**
 * Qwen-VL Service using LangChain
 * 使用 LangChain 调用 Qwen3-VL-235B-A22B 模型进行试卷区域分割
 */

import { HumanMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';

import type {
  RecognitionResult,
  QuestionRegion,
} from '../../common/types/region';

import { ImageValidatorService } from './image-validator.service';
import { PromptBuilderService } from './prompt-builder.service';
import { QwenVLModelService } from './qwen-vl-model.service';
import { ResponseParserService } from './response-parser.service';

@Injectable()
export class QwenVLService {
  private readonly logger = new Logger(QwenVLService.name);

  constructor(
    private readonly modelService: QwenVLModelService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly responseParser: ResponseParserService,
    private readonly imageValidator: ImageValidatorService,
  ) {}

  /**
   * Recognize regions and scores from blank sheets and answers combined
   * 统一识别：同时分析空白答题卡和答案图片，识别答题区域和各题分数、总分
   * @param blankSheetImageUrls Blank answer sheet image URLs (can be multiple pages)
   * @param answerImageUrls Answer image URLs (can be multiple pages)
   * @returns Recognition result with regions and scores
   */
  async recognizeCombined(
    blankSheetImageUrls: string[],
    answerImageUrls: string[],
  ): Promise<RecognitionResult> {
    // Validate all image sizes before processing
    for (const url of [...blankSheetImageUrls, ...answerImageUrls]) {
      await this.imageValidator.validateImageSize(url);
    }

    const prompt = this.promptBuilder.buildCombinedPrompt(
      blankSheetImageUrls.length,
      answerImageUrls.length,
    );
    this.logger.debug('Starting combined recognition', {
      blankSheetCount: blankSheetImageUrls.length,
      answerImageCount: answerImageUrls.length,
      promptLength: prompt.length,
    });

    // Build message content with all images
    const content: Array<
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'text'; text: string }
    > = [];

    // Add blank sheet images first
    for (let i = 0; i < blankSheetImageUrls.length; i++) {
      content.push({
        type: 'image_url',
        image_url: {
          url: blankSheetImageUrls[i],
        },
      });
    }

    // Add answer images
    for (let i = 0; i < answerImageUrls.length; i++) {
      content.push({
        type: 'image_url',
        image_url: {
          url: answerImageUrls[i],
        },
      });
    }

    // Add prompt text at the end
    content.push({
      type: 'text',
      text: prompt,
    });

    const message = new HumanMessage({ content });
    const model = this.modelService.getModel();
    const schema = this.modelService.getSchema();

    try {
      // Use structured output with JSON Schema for automatic validation
      // Include raw response to debug empty results
      this.logger.debug('Creating structured output model', {
        schemaKeys: Object.keys(schema),
      });

      const modelWithStructure = model.withStructuredOutput(schema, {
        method: 'jsonSchema',
        includeRaw: true,
      });

      this.logger.debug('Invoking model with structured output', {
        blankSheetCount: blankSheetImageUrls.length,
        answerImageCount: answerImageUrls.length,
        timestamp: new Date().toISOString(),
      });

      const startTime = Date.now();
      const response = await modelWithStructure.invoke([message]);
      const duration = Date.now() - startTime;

      this.logger.debug('Model invocation completed', {
        duration: `${duration}ms`,
        responseReceived: !!response,
      });

      // Extract parsed result and raw response
      // When includeRaw is true, response has structure: { parsed: T, raw: BaseMessage }
      let parsedResult: RecognitionResult | undefined;
      let rawResponse: any;

      if (response && typeof response === 'object' && 'parsed' in response) {
        const responseWithRaw = response as unknown as {
          parsed: RecognitionResult;
          raw: any;
        };
        parsedResult = responseWithRaw.parsed;
        rawResponse = responseWithRaw.raw;
        this.logger.debug('Extracted parsed and raw from response', {
          hasParsedResult: !!parsedResult,
          hasRawResponse: !!rawResponse,
        });
      } else {
        // Fallback: response is directly the parsed result
        parsedResult = response as unknown as RecognitionResult;
        this.logger.debug('Response is directly parsed result (no raw)', {
          hasParsedResult: !!parsedResult,
        });
      }

      // Log raw response content if available
      if (rawResponse) {
        const rawContent =
          rawResponse.content ||
          rawResponse.text ||
          JSON.stringify(rawResponse);
        this.logger.debug(
          'Raw model response content (before structured parsing)',
          {
            rawContent:
              typeof rawContent === 'string'
                ? rawContent.substring(0, 1000)
                : rawContent,
            rawContentLength:
              typeof rawContent === 'string' ? rawContent.length : 0,
            rawResponseType: typeof rawResponse,
            rawResponseKeys:
              rawResponse && typeof rawResponse === 'object'
                ? Object.keys(rawResponse)
                : [],
          },
        );
      } else {
        this.logger.debug('No raw response available', {
          responseStructure:
            response && typeof response === 'object'
              ? Object.keys(response)
              : [],
        });
      }

      // Use parsed result
      if (!parsedResult) {
        throw new Error('Failed to parse structured output: no parsed result');
      }
      const result = parsedResult;

      // Log raw response from model (before filtering)
      this.logger.debug('Parsed model response (structured output)', {
        rawRegions: result.regions,
        rawScores: result.scores,
        rawRegionCount: Array.isArray(result.regions)
          ? result.regions.length
          : 0,
        rawScoreCount: Array.isArray(result.scores) ? result.scores.length : 0,
      });

      // Validate structure - ensure arrays exist
      const regions = Array.isArray(result.regions) ? result.regions : [];
      const scores = Array.isArray(result.scores) ? result.scores : [];

      // If structured output returned empty arrays, try manual parsing as fallback
      if (regions.length === 0 && scores.length === 0) {
        this.logger.warn(
          'Structured output returned empty arrays, attempting manual parsing fallback',
          {
            blankSheetCount: blankSheetImageUrls.length,
            answerImageCount: answerImageUrls.length,
            parsedResult,
            hasRawResponse: !!rawResponse,
          },
        );

        let manualResult: RecognitionResult | null = null;

        // Try 1: Use raw response if available
        if (rawResponse) {
          try {
            const rawContent = rawResponse.content || rawResponse.text;
            if (
              typeof rawContent === 'string' &&
              rawContent.trim().length > 0
            ) {
              this.logger.debug('Attempting manual parse of raw content', {
                rawContentPreview: rawContent.substring(0, 500),
              });
              manualResult = this.responseParser.parseResponse(rawContent);
            }
          } catch (parseError) {
            this.logger.warn('Manual parsing from raw response failed', {
              error:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
            });
          }
        }

        // Try 2: If no raw response or manual parse failed, call model directly
        if (
          !manualResult ||
          (manualResult.regions.length === 0 &&
            (!manualResult.scores || manualResult.scores.length === 0))
        ) {
          this.logger.debug('Calling model directly for manual parsing', {
            blankSheetCount: blankSheetImageUrls.length,
            answerImageCount: answerImageUrls.length,
          });
          try {
            const directResponse = await model.invoke([message]);
            const directContent = directResponse.content as string;
            if (
              directContent &&
              typeof directContent === 'string' &&
              directContent.trim().length > 0
            ) {
              this.logger.debug(
                'Got direct model response, attempting manual parse',
                {
                  contentPreview: directContent.substring(0, 500),
                  contentLength: directContent.length,
                },
              );
              manualResult = this.responseParser.parseResponse(directContent);
            }
          } catch (directError) {
            this.logger.warn('Direct model call for manual parsing failed', {
              error:
                directError instanceof Error
                  ? directError.message
                  : String(directError),
            });
          }
        }

        // Use manual result if it has content
        if (
          manualResult &&
          (manualResult.regions.length > 0 ||
            (manualResult.scores && manualResult.scores.length > 0))
        ) {
          this.logger.log('Manual parsing succeeded, using manual result', {
            regionCount: manualResult.regions.length,
            scoreCount: manualResult.scores?.length || 0,
          });
          return manualResult;
        }

        this.logger.warn(
          'Model returned empty arrays for both regions and scores (all parsing attempts failed)',
          {
            blankSheetCount: blankSheetImageUrls.length,
            answerImageCount: answerImageUrls.length,
            rawResult: result,
            manualResultAvailable: !!manualResult,
          },
        );
      }

      // Filter out invalid regions (coordinate validation is done by schema, but we still check min < max)
      const validRegions: QuestionRegion[] = regions.filter((region) => {
        const isValid =
          region.x_min_percent < region.x_max_percent &&
          region.y_min_percent < region.y_max_percent;
        if (!isValid) {
          this.logger.debug('Filtered out invalid region (min >= max)', {
            region,
          });
        }
        return isValid;
      });

      // Filter out invalid scores
      const validScores = scores.filter((score) => {
        const isValid = this.responseParser.validateScore(score);
        if (!isValid) {
          this.logger.debug('Filtered out invalid score', {
            score,
          });
        }
        return isValid;
      });

      // Log filtering results
      if (
        validRegions.length !== regions.length ||
        validScores.length !== scores.length
      ) {
        this.logger.debug('Filtered results', {
          originalRegionCount: regions.length,
          validRegionCount: validRegions.length,
          originalScoreCount: scores.length,
          validScoreCount: validScores.length,
        });
      }

      // Expand coordinates by 2% (outward expansion)
      const expandedRegions: QuestionRegion[] = validRegions.map((region) =>
        this.responseParser.expandRegionCoordinates(region),
      );

      this.logger.debug('Successfully parsed response with structured output', {
        regionCount: expandedRegions.length,
        scoreCount: validScores.length,
        expandedRegions:
          expandedRegions.length > 0 ? expandedRegions : undefined,
        validScores: validScores.length > 0 ? validScores : undefined,
      });

      // Log warning if final result is empty
      if (expandedRegions.length === 0 && validScores.length === 0) {
        this.logger.warn('Final recognition result is empty after filtering', {
          blankSheetCount: blankSheetImageUrls.length,
          answerImageCount: answerImageUrls.length,
          rawRegions: regions,
          rawScores: scores,
        });
      }

      // Extract answers if present
      const answers = result.answers;

      this.logger.debug('Extracted answers from result', {
        hasAnswers: !!answers,
        answersRegionCount: answers?.regions?.length || 0,
        answersPreview: answers
          ? JSON.stringify(answers).substring(0, 200)
          : null,
      });

      return {
        regions: expandedRegions,
        scores: validScores,
        answers: answers || undefined,
      };
    } catch (error) {
      // Fallback to manual parsing if structured output fails
      this.logger.warn(
        'Structured output failed, falling back to manual parsing',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      const response = await model.invoke([message]);
      const content = response.content as string;

      if (!content) {
        throw new Error('Model returned empty response');
      }

      return this.responseParser.parseResponse(content);
    }
  }

  /**
   * Recognize question regions from exam paper image
   * @param imageUrl Image URL of the exam paper
   * @returns Recognition result with question regions
   */
  async recognizeRegions(imageUrl: string): Promise<RecognitionResult> {
    // Validate image size before processing
    await this.imageValidator.validateImageSize(imageUrl);

    const prompt = this.promptBuilder.buildBlankSheetPrompt();
    this.logger.debug('Starting region recognition', {
      imageUrl,
      promptLength: prompt.length,
    });

    const message = new HumanMessage({
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    });

    const model = this.modelService.getModel();
    const schema = this.modelService.getSchema();

    try {
      // Use structured output with JSON Schema for automatic validation
      // Include raw response to debug empty results
      this.logger.debug('Creating structured output model', {
        schemaKeys: Object.keys(schema),
      });

      const modelWithStructure = model.withStructuredOutput(schema, {
        method: 'jsonSchema',
        includeRaw: true,
      });

      this.logger.debug('Invoking model with structured output', {
        imageUrl,
        timestamp: new Date().toISOString(),
      });

      const startTime = Date.now();
      const response = await modelWithStructure.invoke([message]);
      const duration = Date.now() - startTime;

      this.logger.debug('Model invocation completed', {
        duration: `${duration}ms`,
        responseReceived: !!response,
      });

      // Debug: Log the actual response structure
      this.logger.debug('Structured output response structure', {
        responseType: typeof response,
        hasParsed:
          response && typeof response === 'object' && 'parsed' in response,
        hasRaw: response && typeof response === 'object' && 'raw' in response,
        responseKeys:
          response && typeof response === 'object' ? Object.keys(response) : [],
        responsePreview: JSON.stringify(response).substring(0, 500),
      });

      // Extract parsed result and raw response
      // When includeRaw is true, response has structure: { parsed: T, raw: BaseMessage }
      let parsedResult: RecognitionResult | undefined;
      let rawResponse: any;

      if (response && typeof response === 'object' && 'parsed' in response) {
        const responseWithRaw = response as unknown as {
          parsed: RecognitionResult;
          raw: any;
        };
        parsedResult = responseWithRaw.parsed;
        rawResponse = responseWithRaw.raw;
        this.logger.debug('Extracted parsed and raw from response', {
          hasParsedResult: !!parsedResult,
          hasRawResponse: !!rawResponse,
        });
      } else {
        // Fallback: response is directly the parsed result
        parsedResult = response as unknown as RecognitionResult;
        this.logger.debug('Response is directly parsed result (no raw)', {
          hasParsedResult: !!parsedResult,
        });
      }

      // Log raw response content if available
      if (rawResponse) {
        const rawContent =
          rawResponse.content ||
          rawResponse.text ||
          JSON.stringify(rawResponse);
        this.logger.debug(
          'Raw model response content (before structured parsing)',
          {
            rawContent:
              typeof rawContent === 'string'
                ? rawContent.substring(0, 1000)
                : rawContent,
            rawContentLength:
              typeof rawContent === 'string' ? rawContent.length : 0,
            rawResponseType: typeof rawResponse,
            rawResponseKeys:
              rawResponse && typeof rawResponse === 'object'
                ? Object.keys(rawResponse)
                : [],
          },
        );
      } else {
        this.logger.debug('No raw response available', {
          responseStructure:
            response && typeof response === 'object'
              ? Object.keys(response)
              : [],
        });
      }

      // Use parsed result
      if (!parsedResult) {
        throw new Error('Failed to parse structured output: no parsed result');
      }
      const result = parsedResult;

      // Log raw response from model (before filtering)
      this.logger.debug('Parsed model response (structured output)', {
        rawRegions: result.regions,
        rawScores: result.scores,
        rawRegionCount: Array.isArray(result.regions)
          ? result.regions.length
          : 0,
        rawScoreCount: Array.isArray(result.scores) ? result.scores.length : 0,
      });

      // Validate structure - ensure arrays exist
      const regions = Array.isArray(result.regions) ? result.regions : [];
      const scores = Array.isArray(result.scores) ? result.scores : [];

      // If structured output returned empty arrays, try manual parsing as fallback
      if (regions.length === 0 && scores.length === 0) {
        this.logger.warn(
          'Structured output returned empty arrays, attempting manual parsing fallback',
          {
            imageUrl,
            parsedResult,
            hasRawResponse: !!rawResponse,
          },
        );

        let manualResult: RecognitionResult | null = null;

        // Try 1: Use raw response if available
        if (rawResponse) {
          try {
            const rawContent = rawResponse.content || rawResponse.text;
            if (
              typeof rawContent === 'string' &&
              rawContent.trim().length > 0
            ) {
              this.logger.debug('Attempting manual parse of raw content', {
                rawContentPreview: rawContent.substring(0, 500),
              });
              manualResult = this.responseParser.parseResponse(rawContent);
            }
          } catch (parseError) {
            this.logger.warn('Manual parsing from raw response failed', {
              error:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
            });
          }
        }

        // Try 2: If no raw response or manual parse failed, call model directly
        if (
          !manualResult ||
          (manualResult.regions.length === 0 &&
            (!manualResult.scores || manualResult.scores.length === 0))
        ) {
          this.logger.debug('Calling model directly for manual parsing', {
            imageUrl,
          });
          try {
            const directResponse = await model.invoke([message]);
            const directContent = directResponse.content as string;
            if (
              directContent &&
              typeof directContent === 'string' &&
              directContent.trim().length > 0
            ) {
              this.logger.debug(
                'Got direct model response, attempting manual parse',
                {
                  contentPreview: directContent.substring(0, 500),
                  contentLength: directContent.length,
                },
              );
              manualResult = this.responseParser.parseResponse(directContent);
            }
          } catch (directError) {
            this.logger.warn('Direct model call for manual parsing failed', {
              error:
                directError instanceof Error
                  ? directError.message
                  : String(directError),
            });
          }
        }

        // Use manual result if it has content
        if (
          manualResult &&
          (manualResult.regions.length > 0 ||
            (manualResult.scores && manualResult.scores.length > 0))
        ) {
          this.logger.log('Manual parsing succeeded, using manual result', {
            regionCount: manualResult.regions.length,
            scoreCount: manualResult.scores?.length || 0,
          });
          return manualResult;
        }

        this.logger.warn(
          'Model returned empty arrays for both regions and scores (all parsing attempts failed)',
          {
            imageUrl,
            rawResult: result,
            manualResultAvailable: !!manualResult,
          },
        );
      }

      // Filter out invalid regions (coordinate validation is done by schema, but we still check min < max)
      const validRegions: QuestionRegion[] = regions.filter((region) => {
        const isValid =
          region.x_min_percent < region.x_max_percent &&
          region.y_min_percent < region.y_max_percent;
        if (!isValid) {
          this.logger.debug('Filtered out invalid region (min >= max)', {
            region,
          });
        }
        return isValid;
      });

      // Filter out invalid scores
      const validScores = scores.filter((score) => {
        const isValid = this.responseParser.validateScore(score);
        if (!isValid) {
          this.logger.debug('Filtered out invalid score', {
            score,
          });
        }
        return isValid;
      });

      // Log filtering results
      if (
        validRegions.length !== regions.length ||
        validScores.length !== scores.length
      ) {
        this.logger.debug('Filtered results', {
          originalRegionCount: regions.length,
          validRegionCount: validRegions.length,
          originalScoreCount: scores.length,
          validScoreCount: validScores.length,
        });
      }

      // Expand coordinates by 2% (outward expansion)
      const expandedRegions: QuestionRegion[] = validRegions.map((region) =>
        this.responseParser.expandRegionCoordinates(region),
      );

      this.logger.debug('Successfully parsed response with structured output', {
        regionCount: expandedRegions.length,
        scoreCount: validScores.length,
        expandedRegions:
          expandedRegions.length > 0 ? expandedRegions : undefined,
        validScores: validScores.length > 0 ? validScores : undefined,
      });

      // Log warning if final result is empty
      if (expandedRegions.length === 0 && validScores.length === 0) {
        this.logger.warn('Final recognition result is empty after filtering', {
          imageUrl,
          rawRegions: regions,
          rawScores: scores,
        });
      }

      return {
        regions: expandedRegions,
        scores: validScores,
      };
    } catch (error) {
      // Fallback to manual parsing if structured output fails
      this.logger.warn(
        'Structured output failed, falling back to manual parsing',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      const response = await model.invoke([message]);
      const content = response.content as string;

      if (!content) {
        throw new Error('Model returned empty response');
      }

      return this.responseParser.parseResponse(content);
    }
  }
}
