/**
 * Application configuration
 * 应用配置
 */

export default () => ({
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    model: process.env.QWEN_VL_MODEL || 'qwen-vl-max-latest',
    baseURL:
      process.env.DASHSCOPE_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  server: {
    port: parseInt(process.env.PORT || '14000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  grading: {
    maxConcurrent: parseInt(process.env.GRADING_MAX_CONCURRENT || '5', 10),
  },
});
