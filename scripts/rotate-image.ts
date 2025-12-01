/**
 * 图片旋转脚本
 * 将图片逆时针旋转 90°
 *
 * Usage:
 *   tsx scripts/rotate-image.ts <input-image> [output-image]
 *
 * Example:
 *   tsx scripts/rotate-image.ts input.jpg output.jpg
 *   tsx scripts/rotate-image.ts input.jpg  # 输出到 input-rotated.jpg
 */

import { existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

import sharp from 'sharp';

/**
 * 生成输出文件名
 */
function generateOutputPath(inputPath: string, outputPath?: string): string {
  if (outputPath) {
    return outputPath;
  }

  const ext = extname(inputPath);
  const name = basename(inputPath, ext);
  const dir = dirname(inputPath);
  return join(dir, `${name}-rotated${ext}`);
}

/**
 * 旋转图片（逆时针 90°）
 */
async function rotateImage(inputPath: string, outputPath: string): Promise<void> {
  try {
    // 检查输入文件是否存在
    if (!existsSync(inputPath)) {
      console.error(`Error: Input file not found: ${inputPath}`);
      process.exit(1);
    }

    console.log(`Reading image: ${inputPath}`);

    // 使用 sharp 读取并旋转图片
    // rotate(-90) 表示逆时针旋转 90°
    await sharp(inputPath)
      .rotate(-90)
      .toFile(outputPath);

    console.log(`✓ Image rotated successfully!`);
    console.log(`Output saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error rotating image:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tsx scripts/rotate-image.ts <input-image> [output-image]');
    console.error('\nExample:');
    console.error('  tsx scripts/rotate-image.ts input.jpg output.jpg');
    console.error('  tsx scripts/rotate-image.ts input.jpg  # 输出到 input-rotated.jpg');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || generateOutputPath(inputPath);

  await rotateImage(inputPath, outputPath);
}

// 运行主函数
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

