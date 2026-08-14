import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.join(__dirname, '../src/utils/robotoFont.js');

function downloadFont(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const b = Buffer.concat(chunks);
        resolve(b.toString('base64'));
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  try {
    console.log('Downloading Roboto-Regular...');
    const regularBase64 = await downloadFont('https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf');
    
    console.log('Downloading Roboto-Bold...');
    const boldBase64 = await downloadFont('https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf');
    
    const content = `// Auto-generated font base64 strings
export const robotoRegularBase64 = "${regularBase64}";
export const robotoBoldBase64 = "${boldBase64}";
`;
    fs.writeFileSync(fontPath, content);
    console.log('Fonts successfully saved to', fontPath);
  } catch (err) {
    console.error('Error downloading fonts:', err);
  }
}

main();
