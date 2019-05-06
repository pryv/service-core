const fs = require('fs');
const path = require('path');

const componentsPath = path.resolve(__dirname, '../components');
const testFiles = getFiles(componentsPath);

testFiles.forEach((testFile) => {
  const fileData = fs.readFileSync(testFile).toString();
  const fileLines = fileData.split('\n');
  const anchor = 'it(\'';
  const anchorLength = anchor.length;
  fileLines.forEach((line, i) => {
    const itPlace = line.indexOf(anchor);
    if (itPlace > 0) {
      fileLines[i] = spliceSlice(line, itPlace, anchorLength, anchor + genId() + '-');
    }
  });
  const fileString = fileLines.join('\n');
  fs.writeFileSync(testFile, fileString);
});


function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      /* Recurse into a subdirectory */
      results = results.concat(getFiles(file));
    } else {
      /* Is a file */
      if (!file.endsWith('.test.js')) {
        return;
      }
      results.push(file);
    }
  });
  return results;
}

function spliceSlice(str, index, count, add) {
  // We cannot pass negative indexes directly to the 2nd slicing operation.
  if (index < 0) {
    index = str.length + index;
    if (index < 0) {
      index = 0;
    }
  }

  return str.slice(0, index) + (add || '') + str.slice(index + count);
}

function genId() {
  const dictionnary = '0123456789ABCDEFGHIJKLMNOPQRSTUVWYZ';
  const num = dictionnary.length;

  return dictionnary[getIndex()] + dictionnary[getIndex()] + dictionnary[getIndex()] + dictionnary[getIndex()];

  function getIndex() { return Math.floor(Math.random() * num); }
}