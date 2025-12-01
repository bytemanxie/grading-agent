# Grading Agent

AI-powered exam paper recognition and answer recognition service built with NestJS and LangChain.

## Features

- 🎯 Recognize question regions from exam paper images
- 📊 Support multiple question types: choice (选择题), fill (填空题), essay (解答题)
- 📐 Return percentage-based coordinates (0-100) for each region
- 🔄 REST API for easy integration
- 📝 TypeScript with full type safety
- 📚 Swagger API documentation
- 🚀 Built with NestJS for high concurrency support

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

Edit `.env` and add your configuration:

```env
DASHSCOPE_API_KEY=your-api-key-here
QWEN_VL_MODEL=qwen-vl-max-latest
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PORT=3002
NODE_ENV=development
```

## Usage

### Start the NestJS Server

```bash
# Development mode (with hot reload)
pnpm dev

# Production mode
pnpm build
pnpm start:prod
```

The server will start on `http://localhost:3002` by default.

### API Documentation

Once the server is running, visit:

- Swagger UI: `http://localhost:3002/api/docs`
- Health Check: `http://localhost:3002/health`

### API Endpoints

#### 1. Recognize Regions

**POST** `/api/recognition/regions`

Recognize question regions from an exam paper image.

**Request Body:**

```json
{
  "imageUrl": "https://example.com/exam-paper.jpg",
  "model": "qwen-vl-max-latest" // optional
}
```

**Response:**

```json
{
  "regions": [
    {
      "type": "choice",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 30.0
    },
    {
      "type": "fill",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 30.0,
      "x_max_percent": 95.0,
      "y_max_percent": 60.0
    }
  ]
}
```

#### 2. Recognize Answers

**POST** `/api/recognition/answers`

Recognize answers from exam paper regions.

**Request Body:**

```json
{
  "imageUrl": "https://example.com/exam-paper.jpg",
  "regions": [
    {
      "type": "choice",
      "question_number": 1,
      "x_min_percent": 5.0,
      "y_min_percent": 10.0,
      "x_max_percent": 95.0,
      "y_max_percent": 30.0
    }
  ],
  "model": "qwen-vl-max-latest" // optional
}
```

**Response:**

```json
{
  "regions": [
    {
      "type": "choice",
      "region": {
        "type": "choice",
        "question_number": 1,
        "x_min_percent": 5.0,
        "y_min_percent": 10.0,
        "x_max_percent": 95.0,
        "y_max_percent": 30.0
      },
      "questions": [
        {
          "question_number": 1,
          "answer": "A"
        },
        {
          "question_number": 2,
          "answer": "B"
        }
      ]
    }
  ]
}
```

### Example Usage with cURL

```bash
# Recognize regions
curl -X POST http://localhost:3002/api/recognition/regions \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/exam-paper.jpg"
  }'

# Recognize answers
curl -X POST http://localhost:3002/api/recognition/answers \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/exam-paper.jpg",
    "regions": [
      {
        "type": "choice",
        "question_number": 1,
        "x_min_percent": 5.0,
        "y_min_percent": 10.0,
        "x_max_percent": 95.0,
        "y_max_percent": 30.0
      }
    ]
  }'
```

### Integration with dl-front

The service is integrated with dl-front. Use the recognition services:

```typescript
import {
  answerSheetRecognitionService,
  answerRecognitionService,
} from '@/services';

// Recognize regions
const regions = await answerSheetRecognitionService.recognizeRegions(
  'https://example.com/exam-paper.jpg',
);

// Recognize answers
const answers = await answerRecognitionService.recognizeAnswers(
  'https://example.com/exam-paper.jpg',
  regions.regions,
);
```

Configure the recognition API URL in dl-front:

```env
NEXT_PUBLIC_RECOGNITION_API_URL=http://localhost:3002/api
```

## Output Format

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
│   ├── main.ts                    # NestJS application entry
│   ├── app.module.ts              # Root module
│   ├── config/                    # Configuration
│   │   └── configuration.ts
│   ├── common/                    # Common utilities
│   │   ├── filters/              # Exception filters
│   │   └── interceptors/        # Interceptors
│   ├── recognition/               # Recognition module
│   │   ├── recognition.module.ts
│   │   ├── recognition.controller.ts
│   │   ├── recognition.service.ts
│   │   ├── dto/                  # Data Transfer Objects
│   │   └── responses/            # Response types
│   ├── services/                  # Core services
│   │   ├── qwen-vl.service.ts
│   │   ├── answer-recognition.service.ts
│   │   └── image-crop.service.ts
│   ├── types/                    # Type definitions
│   │   ├── region.ts
│   │   └── answer.ts
│   └── index.ts                  # CLI entry (legacy)
├── .env.example                  # Environment variables template
├── nest-cli.json                 # NestJS CLI configuration
├── package.json                   # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

## Configuration

### Environment Variables

- `DASHSCOPE_API_KEY` (required): Your DashScope API key
- `QWEN_VL_MODEL` (optional): Model name (default: `qwen-vl-max-latest`)
  - Available models:
    - `qwen-vl-max-latest`: Qwen VL Max (超大规模视觉语言模型，推荐)
    - `qwen-vl-plus-latest`: Qwen VL Plus (增强版)
    - `qwen3-vl-plus`: Qwen3 VL Plus (最新版本)
- `DASHSCOPE_BASE_URL` (optional): API base URL (default: `https://dashscope.aliyuncs.com/compatible-mode/v1`)
- `PORT` (optional): Server port (default: `3002`)
- `NODE_ENV` (optional): Environment (default: `development`)

## Architecture

The application follows NestJS best practices:

- **Modular Architecture**: Each feature is organized in its own module
- **Dependency Injection**: Services are injected using NestJS DI container
- **DTO Validation**: Request validation using class-validator
- **Error Handling**: Global exception filter for consistent error responses
- **Logging**: Request/response logging with NestJS Logger
- **API Documentation**: Swagger/OpenAPI integration

## License

MIT
