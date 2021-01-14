/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * read all files in CONFIG_LEARN_DIR and output a readable result
 */

const path = require('path');
const learnDir = process.env.CONFIG_LEARN_DIR || path.resolve(__dirname, '../../../learn-config');
console.log('Looking for learning files in: ' + learnDir);
const fs = require('fs');

const apps = {};
const ranking = {};

// get all files
const files = fs.readdirSync(learnDir);

for (const file of files) {
  if (file.endsWith('-calls.csv')) {
    handleCSV(path.join(learnDir, file));
  }
  if (file.endsWith('-config.json')) {
    //handleConfig(path.join(learnDir, file));
  }
}


function handleCSV(file) {
  const appNameSearch = /.*\/([a-zA-Z\-]*)[0-9]{1,2}-calls.csv/;
  const appName = file.match(appNameSearch)[1];
  
  // initialize apps.appname if needed
  if (! apps[appName]) {
    apps[appName] = {
      calls: {},
      rank: {}
    }
  }

  
  const filelines = fs.readFileSync(file, 'utf-8').split('\n');
  for (let line of filelines) {
    // -- calls count
    const [path, call] = line.split(';');
    const key = deepFind(apps[appName].calls, path + ':calls');
    if (! key[call]) key[call] = 0;
    key[call]++;
    // -- ranking
    apps[appName].rank[line] = key[call];
  }
}

function deepFind(obj, path) {
  var paths = path.split(':')
    , current = obj
    , i;

  for (i = 0; i < paths.length; ++i) {
    if (current[paths[i]] == undefined) {
      current[paths[i]] = {}; // initialize path while searching
    }
    current = current[paths[i]];
  }
  return current;
}


// sort and filter ranking
const KEEP_HIGHER_N = 10;

for (let appName of Object.keys(apps)) {
  const app = apps[appName];
  const arrayOfCalls = [];
  for (let callLine of Object.keys(app.rank)) {
    arrayOfCalls.push({count: app.rank[callLine], line: callLine});
   
  }
  const arrayOfCallsSorted = arrayOfCalls.sort((a, b) => { return b.count - a.count});
  // replace rank info
  app.rank =  arrayOfCallsSorted.slice(0, KEEP_HIGHER_N);
  console.log(app.rank);
}

fs.writeFileSync(path.join(learnDir, 'compute.json'), JSON.stringify(apps, null, 2));
//console.log(apps);