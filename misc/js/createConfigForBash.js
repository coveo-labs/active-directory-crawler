/**
 * Reads the config.js and generate temp/config.sh to be used by crawlAD.sh
 */
const config = require('../config'),
  fs = require('fs');

const TEMP_FOLDER = './temp';

let fileContent = '#!/usr/bin/env bash\n';
Object.keys(config).forEach(key=>{
  let value = config[key];
  value = value.replace(/\\/g,'\\\\');
  fileContent += `${key}="${value}"\n`;
});

fs.writeFileSync(`${TEMP_FOLDER}/config.sh`, fileContent, 'utf-8');
