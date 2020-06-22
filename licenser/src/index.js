
const fs = require('fs');
const path = require('path');
const ignores = ['node_modules', '.git', 'dest/dist/'];

// --- extract default version from dest/package.json
const version = require('../../package.json').version;

const fileSpecs = {
  '.js' : [
   {
      action: 'addHeader',
      startBlock: '/**\n * @license',
      lineBlock: ' * ',
      endBlock: '\n */\n'
    }
  ],
  'README.md': [
    {
      action: 'addTrailer',
      startBlock: '# License',
      lineBlock: '',
      endBlock: '' // (go up to the end of the file)
    }
  ],
  'package.json': [
    {
      action: 'json',
      force: {
        author: "Pryv S.A. <support@pryv.com> (http://pryv.com)"
      },
      defaults: {
        homepage: "http://pryv.com"
      },
      sortPackage: true
    },
    {
      action: 'addSibling'
    }
  ]
}

async function start() {
  await loadAction(require('./actions/addHeader'));
  await loadAction(require('./actions/json'));
  await loadAction(require('./actions/addSibling'));
  await loadAction(require('./actions/addTrailer'));
  checkInit();

  // Add licenses to the source code js files
  await loop('../components');
}


// ----------------- helpers

// load license file (add an extra starting)
const license = '\n' + fs.readFileSync(path.resolve(__dirname, 'LICENSE'), 'utf-8');

const specKeys = Object.keys(fileSpecs);
// -- load actions
async function loadAction(action) {
  // -- prepare actions
  for (const specKey of specKeys) {
    for (const actionItem of fileSpecs[specKey]) {
      if (actionItem.action === action.key) {
        console.log('Loading: ' + action.key + ' for ' + specKey);
        await action.prepare(actionItem, license);
      }
    }
  };
}

// throw an error if some handlers have not been initalizes
function checkInit() {
  for (const specKey of specKeys) {
    for (const actionItem of fileSpecs[specKey]) {
      if (!actionItem.actionMethod) {
        console.error('Handler "' + actionItem.action + '" for "' + specKey + '" has not been initialized');
        process.exit(0);
      }
    }
  };
}



/**
 * Helper to find the corresponding specs for a file
 * @param {String} fullPath 
 */
function getFileSpec(fullPath) {
  for (const specKey of specKeys) {
    if (fullPath.endsWith(specKey)) {
      return fileSpecs[specKey];
    }
  }
}

/**
 * Return true is this file or directory should be ignored
 * @param {String} fullPath
 */
function ignore(fullPath) {
  for (const i of ignores) {
    if (fullPath.indexOf(i) >= 0) return true;
  }
  return false;
}

/**
 * Called for each matched file
 * @param {String} fullPath a file Path
 * @param {Object} spec the Specifications from fileSpecs matching this file
 */
async function handleMatchingFile(fullPath, spec) {
  for (const actionItem of spec) {
    actionItem.actionMethod(fullPath);
  }
  count++;
}

/**
 * Software entrypoint
 * Loop recursively in the directory
 * - ignore files or dir matching one of the ignore items
 * - call handleMatchingFile each time a file matching a fileSpec is found
 * @param {String} dir 
 */
async function loop(dir) {
  //console.log('>' + dir);
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    const fullPath = path.resolve(dir, file);
    if (ignore(fullPath)) continue;
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      await loop(fullPath); // recurse
    } else if (stat.isFile()) {
      const spec = getFileSpec(fullPath);
      if (spec) await handleMatchingFile(fullPath, spec);
    } else {
      console.log(stat);
      throw new Error();
    }
  }
}



// --- ru 

let count = 0;
(async () => {
  const startTime = Date.now();
  await start();
  console.log('Added license to ' + count + ' files in ' + Math.round((Date.now() - startTime) / 10) / 100 + ' s');
})();
