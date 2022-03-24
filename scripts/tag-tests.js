/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const fs = require('fs');
const path = require('path');

const componentsPath = path.resolve(__dirname, '../components');

let testsCount = 0;
let taggedTests = 0;
let tags = {};

readDir(componentsPath);

console.log('total tests', testsCount);
console.log('tagged tests', taggedTests);

function readDir(dirName) {
  fs.readdirSync(dirName, { withFileTypes: true }).forEach(function (file) {
    const fileName = file.name;
    const subPath = path.resolve(dirName, fileName);
    const stats = fs.statSync(subPath);
    if (stats.isDirectory()) {
      readDir(subPath);
    }
    
    if (isTestFile(fileName)) {
      addIdToTests(subPath);
    }
  });
}

function isTestFile(filename) {
  return filename.endsWith('.test.js'); 
}

function addIdToTests(file) {
  let isTagged = false;

  const fileContent = fs.readFileSync(file, 'utf8');
  const lines = fileContent.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (isTestName(trimmed)) {
      if (isUntagged(trimmed)) {
        let tag = null;
        while (tag === null) {
          tag = genTag();
          if (tags[tag]) tag = null;
        } 
        registerTag(tag);
        const tagged = sSplice(line, tag);
        lines[i] = tagged;
        isTagged = true;
        taggedTests++;
      }
      testsCount++;
    }
  });

  if (isTagged) {
    const newContent = lines.join('\n');
    fs.writeFileSync(file, newContent);
  }
}

function sSplice(string, toAdd) {
  const aString = string.split('');
  const from = string.indexOf('it(') + 4;
  aString.splice(from, 0, toAdd);
  return aString.join('');
}

function isTestName(line) {
  return line.startsWith('it(');
}

function ignoreLine(line) {
  return ! line.startsWith('it(\'');
}

function registerTag(tag) {
  if (tags[tag]) { 
    throw('[' + tag + '] Is used multiple time');
  }
  tags[tag] = true;
}

function isUntagged(line) {
  if (ignoreLine(line)) {
    console.log("Ignored test line: " + line); 
    return false;
  }
  const test = line.match(/^it\('\[([A-Z0-9]{4})\](.*)/);
  if (! test) { 
    console.log('Tagging => ' + line);
    return true;
  }
  registerTag(test[1]);
  return false;
}

function genTag() {
  const alphabet = 'ABCDEFGHIJKLMONPQRSTUVWXYZ0123456789';
  
  return '[' + getLetter() + getLetter() + getLetter() + getLetter() + '] ';
  
  function getLetter() {
    return alphabet[randomIntFromInterval(0, alphabet.length - 1)];
  }

  function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
}