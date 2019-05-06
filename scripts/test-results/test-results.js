const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const moment = require('moment');
const mkdirp = require('mkdirp');

const RESULTS_FOLDER = __dirname + '/../../test_results/service-core/';

try {
  fs.statSync(RESULTS_FOLDER);
} catch (e) {
  console.log('Results repository folder', RESULTS_FOLDER, 'does not exist, please create it using "yarn init-test-results-repo".'); // eslint-disable-line 
  process.exit(1);
}

const gitTag = getReleaseVersion();

const VERSION_FOLDER = gitTag + '/';
const FULL_VERSION_FOLDER = RESULTS_FOLDER + VERSION_FOLDER;
mkdirp(FULL_VERSION_FOLDER);

const time = moment().format('YYYYMMDD-hhmmss');
const OUTPUT_FILENAME =  time + '-service-core.json';

const componentsPath = path.resolve(__dirname, '../../dist/components');

const test_results = [];

fs.readdirSync(componentsPath).forEach(function (name) {
  var subPath = path.join(componentsPath, name);
  if (!fs.existsSync(path.join(subPath, 'package.json'))) {
    return;
  }

  // produces stdout output - makes output unparsable as JSON
  if (name === 'pryvuser-cli' || name === 'storage') return;

  // contains no test script which produces error - makes output unparsable as JSON
  if (name === 'test-helpers' || name === 'errors') return;

  const displayName = pad(name);
  console.log(displayName); // eslint-disable-line 
  const res = childProcess.spawnSync('../../node_modules/.bin/mocha', [
    '--logs:console:active=false',
    '--timeout 10000',
    '--reporter=json',
    'test/**/*.test.js'], {
      env: process.env,
      cwd: subPath,
    });

  const componentResults = JSON.parse(res.stdout.toString());
  componentResults.componentName = name;
  test_results.push(componentResults);
});

console.log('writing test output to:', OUTPUT_FILENAME); // eslint-disable-line

linkToLatestResult();
linkToLatestVersion();

function pad(str) {
  //                total len           - a space - the name
  const targetLen = process.stdout.columns - 1 - str.length;
  return str + ' ' + '-'.repeat(targetLen);
}

function getReleaseVersion() {
  const res = childProcess.spawnSync('git', ['describe'], {
    env: process.env,
    cwd: RESULTS_FOLDER + '/..',
  });

  const gitTagDirty = res.stdout.toString();
  return gitTagDirty.split('-')[0];
}

function linkToLatestResult() {
  childProcess.spawnSync('rm', [VERSION_FOLDER + 'latest']);
  childProcess.spawnSync('ln', ['-s', OUTPUT_FILENAME, 'latest'],
    {
      env: process.env,
      cwd: VERSION_FOLDER,
    });
}

function linkToLatestVersion() {
  childProcess.spawnSync('rm', [RESULTS_FOLDER + 'latest']);
  childProcess.spawnSync('ln', ['-s', VERSION_FOLDER, 'latest'],
    {
      env: process.env,
      cwd: RESULTS_FOLDER,
    });
}