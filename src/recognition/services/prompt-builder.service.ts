/**
 * Prompt Builder Service
 * 负责构建识别用的 prompt
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptBuilderService {
  /**
   * Build prompt for blank sheet recognition
   * 构建空白答题卡识别 prompt
   */
  buildBlankSheetPrompt(): string {
    return `请分析这张空白答题卡图片，识别出选择题区域和每道题的分数：

**任务说明**：
1. **选择题区域**（choice）：识别所有选择题，合并为一个区域。如果没有选择题，regions 数组为空。
2. **分数信息**（scores）：识别试卷上所有题目的题号和分值，包括选择题、大题、小题、填空题等。

**格式要求**：
- 坐标必须是百分比形式（0-100），字段名：x_min_percent, y_min_percent, x_max_percent, y_max_percent
- 题号保持原样（数字、中文、小题号等）
- 必须直接返回有效的 JSON 格式，不要使用 markdown 代码块

JSON 格式示例：
{
  "regions": [
    {
      "type": "choice",
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 35.0
    }
  ],
  "scores": [
    {"questionNumber": 1, "score": 2},
    {"questionNumber": 2, "score": 2},
    {"questionNumber": "4(1)", "score": 3},
    {"questionNumber": "4(2)", "score": 2},
    {"questionNumber": "18(1)①", "score": 2},
    {"questionNumber": "18(1)②", "score": 2}
  ]
}

请直接返回 JSON，不要包含其他文字说明。`;
  }

  /**
   * Build prompt for combined recognition
   * 构建统一识别 prompt
   */
  buildCombinedPrompt(
    blankSheetCount: number,
    answerImageCount: number,
  ): string {
    const blankSheetText =
      blankSheetCount === 1
        ? '第一张图片是空白答题卡'
        : `前${blankSheetCount}张图片是空白答题卡`;
    const answerText =
      answerImageCount === 1
        ? '最后一张图片是答案图片'
        : `后面${answerImageCount}张图片是答案图片`;

    return `分析这些图片，识别以下内容：

**图片说明**：
- ${blankSheetText}，用于识别答题区域、题目分数和标准答案（**主要来源，优先使用**）
- ${answerText}，标准答案供参考（**补充参考，仅在空白答题卡信息不完整时参考**）

**任务要求**（重要：所有要求都必须完成）：
1. **选择题区域**（regions）：**必须识别**。从空白答题卡识别所有选择题，合并为一个区域。如果试卷中有选择题（如第1-12题），regions 数组**不能为空**，必须包含选择题区域。只有在试卷完全没有选择题的情况下，regions 数组才为空。
2. **每题分数**（scores）：**必须从空白答题卡识别所有题目的分数**，包括：
   - **必须以空白答题卡为准**：识别空白答题卡上所有题目的题号和分值，这是分数的唯一来源
   - **答案图片不用于识别分数**：答案图片仅用于标准答案的参考，不要从答案图片识别分数
   - 包括所有题目类型：
     - 选择题：如 1, 2, 3 等
     - 大题：如 13, 14, 21, 22 等
     - **小题**：如 "13(1)", "13(2)", "21(1)", "21(2)" 等格式（注意：小题题号必须使用字符串格式，如 "13(1)"）
     - **中文题号**：如 "六", "第一题" 等（注意：中文题号必须使用字符串格式，保持原样）
   - **重要**：
     - 分数识别**必须以空白答题卡为准**，不要从答案图片识别分数
     - 必须识别空白答题卡上的所有题目分数，不能遗漏任何题目
     - 如果空白答题卡上某个题目没有标注分数，可以标记为 0 或根据题目类型推断
3. **标准答案**（answers）：**必须返回，不能为空**。**优先从空白答题卡识别所有题目的标准答案**，答案图片仅作为参考。需要识别**答题卡上所有题目**的标准答案，包括：
   - 选择题：识别选项（A、B、C、D等）
   - 填空题：识别填空内容
   - 解答题：识别解答内容
   - **小题**：必须识别所有小题的标准答案，题号格式如 "13(1)", "13(2)" 等
   - **中文题号题目**：必须识别所有中文题号题目的标准答案，如 "六", "作文" 等
   - **重要**：如果答题卡上有题目但答案图片上没有对应答案，**必须从空白答题卡识别**，确保识别完整，不遗漏任何题目

**格式要求**：
- 坐标必须是百分比形式（0-100），字段名：x_min_percent, y_min_percent, x_max_percent, y_max_percent
- 题号格式：
  - **数字题号**：使用数字类型，如 1, 2, 13, 21
  - **小题题号**：必须使用字符串格式，如 "13(1)", "13(2)", "21(1)", "21(2)"
  - **中文题号**：必须使用字符串格式，保持原样，如 "六", "第一题"（不要转换为数字）
- answers 字段**必须返回**，包含所有题目的标准答案
- question_number 字段：
  - 数字题号使用数字类型（如 1, 2, 13）
  - 小题题号使用字符串格式（如 "13(1)", "13(2)"）
  - 中文题号使用字符串格式（如 "六", "作文"），必须保持原样

**JSON 格式示例**：
{
  "regions": [
    {
      "type": "choice",
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 35.0
    }
  ],
  "scores": [
    {"questionNumber": 1, "score": 3},
    {"questionNumber": 2, "score": 3},
    {"questionNumber": 13, "score": 2},
    {"questionNumber": "13(1)", "score": 1},
    {"questionNumber": "13(2)", "score": 1},
    {"questionNumber": 21, "score": 8},
    {"questionNumber": "21(1)", "score": 4},
    {"questionNumber": "21(2)", "score": 4},
    {"questionNumber": "六", "score": 10},
    {"questionNumber": "作文", "score": 20}
  ],
  "answers": {
    "regions": [
      {
        "type": "choice",
        "region": {
          "type": "choice",
          "x_min_percent": 5.0,
          "y_min_percent": 10.0,
          "x_max_percent": 95.0,
          "y_max_percent": 35.0
        },
        "questions": [
          {"question_number": 1, "answer": "A"},
          {"question_number": 2, "answer": "B"},
          {"question_number": 3, "answer": "C"}
        ]
      },
      {
        "type": "essay",
        "region": {
          "type": "essay",
          "x_min_percent": 0,
          "y_min_percent": 0,
          "x_max_percent": 100,
          "y_max_percent": 100
        },
        "questions": [
          {"question_number": 13, "answer": "1.20 -8 398"},
          {"question_number": "13(1)", "answer": "1.20"},
          {"question_number": "13(2)", "answer": "-8 398"},
          {"question_number": 21, "answer": "(1)120 (2)0.5h (3)120km"},
          {"question_number": "21(1)", "answer": "120"},
          {"question_number": "21(2)", "answer": "0.5h"},
          {"question_number": "21(3)", "answer": "120km"},
          {"question_number": "六", "answer": "示例答案内容"},
          {"question_number": "作文", "answer": "示例作文答案内容"}
        ]
      }
    ]
  }
}

**重要提醒**：
- 如果试卷有选择题，regions 数组**不能为空**
- answers 字段**必须返回**，不能省略
- **分数识别必须以空白答题卡为准**：所有题目的分数必须从空白答题卡识别，不要从答案图片识别分数
- **必须识别空白答题卡上的所有题目**，包括分数和标准答案，即使答案图片上没有对应题目，也要识别完整
- 标准答案**优先从空白答题卡识别**，答案图片仅作为参考
- 小题题号必须使用字符串格式，如 "13(1)", "13(2)"
- 中文题号必须使用字符串格式，保持原样，如 "六", "第一题"（不要转换为数字）
- 必须识别所有题目的标准答案，包括小题和中文题号题目，确保不遗漏空白答题卡上的任何题目

请直接返回 JSON，不要包含其他文字说明。`;
  }
}
