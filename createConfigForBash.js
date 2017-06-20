/**
 * Reads the config.js and generate temp/config.sh to be used by crawlAD.sh
 */
const config = require('./config'),
  fs = require('fs');

let fileContent = '#!/usr/bin/env bash\n';
Object.keys(config).forEach(key=>{
  let value = config[key];
  value = value.replace(/\\/g,'\\\\');
  fileContent += `${key}="${value}"\n`;
});

fs.writeFileSync('./temp/config.sh', fileContent, 'utf-8');
