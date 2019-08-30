const fs = require('fs');
const path = require('path');

const componentsPath = path.resolve(__dirname, '../components');

let testsCount = 0;
let taggedTests = 0;

readDir(componentsPath);

console.log('total tests', testsCount);
console.log('tagged tests', taggedTests);

function readDir(dirName) {
  fs.readdirSync(dirName, { withFileTypes: true }).forEach(function (fileName) {
    const subPath = path.resolve(dirName, fileName);
    const stats = fs.statSync(subPath);
    if (stats.isDirectory()) {
      readDir(subPath);
    }
    
    if (fileName.endsWith('test.js')) {
      addIdToTests(subPath);
    }
  });
}

function addIdToTests(file) {
  let isTagged = false;

  const fileContent = fs.readFileSync(file, 'utf8');
  const lines = fileContent.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (isTestName(trimmed)) {
      if (isUntagged(trimmed)) {
        const tagged = sSplice(line, genTag());
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

function isUntagged(line) {
  return !line.startsWith('it(\'[') && !line.startsWith('it("[') && !line.startsWith('it(`[');
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