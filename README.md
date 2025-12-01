# Grading Agent

LangChain TypeScript project for calling Qwen3-VL-235B-A22B model to segment exam paper regions.

## Features

- 🎯 Recognize question regions from exam paper images
- 📊 Support multiple question types: choice (选择题), fill (填空题), essay (解答题)
- 📐 Return percentage-based coordinates (0-100) for each region
- 🔄 Built with LangChain.js for easy integration
- 📝 TypeScript with full type safety

## Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- DashScope API Key ([Get one here](https://dashscope.console.aliyun.com/))

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd grading-agent
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your DashScope API key:
```env
DASHSCOPE_API_KEY=your-api-key-here
```

## Usage

### Command Line

```bash
# Development mode
pnpm dev <image-url>

# Example
pnpm dev https://example.com/exam-paper.jpg
```

### Programmatic Usage

```typescript
import { createQwenVLService } from './services/qwen-vl.js';

const service = createQwenVLService({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  model: 'qwen-vl-max-latest', // or 'qwen-vl-plus-latest', 'qwen3-vl-plus'
});

const result = await service.recognizeRegions('https://example.com/exam-paper.jpg');
console.log(result);
```

## Output Format

The service returns a JSON object with recognized regions:

```json
{
  "regions": [
    {
      "type": "choice",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 15.0
    },
    {
      "type": "fill",
      "question_number": 2,
      "x_min_percent": 5.0,
      "y_min_percent": 20.0,
      "x_max_percent": 95.0,
      "y_max_percent": 25.0
    }
  ]
}
```

### Question Types

- `choice`: Multiple choice questions (选择题)
- `fill`: Fill-in-the-blank questions (填空题)
- `essay`: Essay/solution questions (解答题)

### Coordinates

All coordinates are percentages (0-100) relative to the image dimensions:
- `x_min_percent`: Left boundary
- `y_min_percent`: Top boundary
- `x_max_percent`: Right boundary
- `y_max_percent`: Bottom boundary

## Development

### Build

```bash
pnpm build
```

### Type Check

```bash
pnpm type-check
```

### Lint

```bash
pnpm lint
```

### Format

```bash
pnpm format
```

## Project Structure

```
grading-agent/
├── src/
│   ├── index.ts          # Main entry point
│   ├── services/
│   │   └── qwen-vl.ts    # Qwen VL service implementation
│   └── types/
│       └── region.ts     # Type definitions
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## Configuration

### Environment Variables

- `DASHSCOPE_API_KEY` (required): Your DashScope API key
- `QWEN_VL_MODEL` (optional): Model name (default: `qwen-vl-max-latest`)
  - Available models:
    - `qwen-vl-max-latest`: Qwen VL Max (超大规模视觉语言模型，推荐)
    - `qwen-vl-plus-latest`: Qwen VL Plus (增强版)
    - `qwen3-vl-plus`: Qwen3 VL Plus (最新版本，2025年9月发布)
- `DASHSCOPE_BASE_URL` (optional): API base URL (default: `https://dashscope.aliyuncs.com/compatible-mode/v1`)

## License

MIT

