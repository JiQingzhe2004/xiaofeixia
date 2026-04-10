const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../resources/icons/icon.png');
const outputPath = path.join(__dirname, '../resources/icons/icon.ico');

pngToIco(inputPath)
  .then(buf => {
    fs.writeFileSync(outputPath, buf);
    console.log('Successfully converted icon.png to icon.ico');
  })
  .catch(err => {
    console.error('Error converting icon:', err);
    process.exit(1);
  });
