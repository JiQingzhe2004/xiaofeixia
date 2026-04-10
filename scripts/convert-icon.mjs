import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath = join(__dirname, '../resources/icons/icon.png');
const tempPath = join(__dirname, '../resources/icons/icon_square.png');
const outputPath = join(__dirname, '../resources/icons/icon.ico');

async function convert() {
  try {
    console.log('Making image 1024x1024 square...');
    await sharp(inputPath)
      .resize(1024, 1024, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toFile(tempPath);

    console.log('Converting to ICO (256x256 for Windows compatibility)...');
    // .ico 格式在 Windows 下标准上限是 256x256，我们会保留最高清的 png
    const buf = await pngToIco(tempPath);
    fs.writeFileSync(outputPath, buf);

    // 将 1024 的 PNG 保存为主图标
    const highResPng = join(__dirname, '../resources/icons/icon_1024.png');
    fs.copyFileSync(tempPath, highResPng);
    
    // Clean up temp file
    fs.unlinkSync(tempPath);

    console.log('Successfully created icon.ico and icon_1024.png');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

convert();
