/**
 * read all files in CONFIG_LEARN_DIR and output a readable result
 */
const learnDir = process.env.CONFIG_LEARN_DIR;

const fs = require('fs');
const path = require('path');
const apps = {};

// get all files
const files = fs.readdirSync(learnDir);

for (const file of files) {
  if (file.endsWith('-calls.csv')) {
    handleCSV(path.join(learnDir, file));
  }
}




function handleCSV(file) {
  const appNameSearch = /.*\/([a-zA-Z\-]*)[0-9]{1,2}-calls.csv/;
  const appName = file.match(appNameSearch)[1];
  
  // initialize apps.appname if needed
  if (! apps[appName]) {
    apps[appName] = {
    }
  }

  const filelines = fs.readFileSync(file, 'utf-8').split('\n');
  for (let line of filelines) {
    const [path, call] = line.split(';');
    const key = deepFind(apps[appName], path + ':calls');
    if (! key[call]) key[call] = 0;
    key[call]++;
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

fs.writeFileSync(path.join(learnDir, 'compute.json'), JSON.stringify(apps, null, 2));
console.log(apps);