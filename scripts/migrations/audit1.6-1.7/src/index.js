/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const MongoClient = require('../../../../dist/node_modules/mongodb').MongoClient;

const fs = require('fs');
const path = require('path');
const lineReader = require('line-reader');

const DistPath = '../../../../dist/';


const { getConfig } = require(DistPath + 'node_modules/@pryv/boiler').init({
  appName: 'audit-migration',
  baseConfigDir: path.resolve(__dirname, DistPath + 'components/api-server/config'),
  extraConfigs: [{
    scope: 'default-paths',
    file: path.resolve(__dirname, DistPath + 'components/api-server/config/paths-config.js')
  },{
    scope: 'default-audit',
    file: path.resolve(__dirname, DistPath + 'components/audit/config/default-config.yml')
  }, {
    scope: 'default-audit-path',
    file: path.resolve(__dirname,  DistPath + 'components/audit/config/default-path.js')
  }]
});


const audit = require( DistPath + 'components/audit');


async function userIdForusername(username) {
  const res = await db.collection('events').findOne({'username__unique': username});
  if (!res) return null;
  return res.userId;
}

async function listDirectory(logDiretory) {
  return new Promise((resolve, reject) => { 
    fs.readdir(logDiretory, {withFileTypes: true}, (err, fileTypes) => {
      if (err) return reject(err);
      resolve(fileTypes.filter( f => f.isDirectory()).map( d => d.name ));
    });
  });
}

function listAuditFilesForUser(username) {
  function getLogN(filname) {
    const s = filname.split('.');
    if (s.lenght < 3) return 0;
    return parseInt(s[2]);
  }

  return new Promise((resolve, reject) => { 
    const userDir = path.resolve(audiLogsDirs, username);
    fs.readdir(userDir, {withFileTypes: true}, (err, fileTypes) => {
      if (err) return reject(err);
      resolve(fileTypes
        .filter( f => ! f.isDirectory() && f.name.startsWith('audit.log') )
        .map( d => d.name )
        .sort((first, second) => {
          return getLogN(first) - getLogN(second)
        }));
    });
  });
}


function readFile(username, filename) {
  const file = path.resolve(audiLogsDirs, username, filename);

  return new Promise((resolve, reject) => { 
    let count = 0;
    let lineCount = 0;
    lineReader.eachLine(file, function(line, last, cb) {
      lineCount++;
      let item;
      try {
         item = eventFromLine(line, username);
      } catch (e) {
        cb(false)
        reject(new Error('Error on file ' + file+':'+lineCount, e.message));
        return;
      }
      if (! item ) {
        count++;
      }
      if (last) resolve();
      if (count > 10) { 
        cb(false); 
        resolve();
        return;
      }
      cb();
    });
  });
}

const AUTO_ACTIONS = {};
const ALL_METHODS = require(DistPath + 'components/audit/src/ApiMethods').ALL_METHODS;

const HTTP = {
  'create': 'POST',
  'get': 'GET',
  'update': 'PUT',
  'delete': 'DELETE'
}

for (let a of ALL_METHODS) {
  const s = a.split('.');
  const h = HTTP[s[1]];
  if (! h) continue;
  AUTO_ACTIONS[h + ' /'+s[0]] = 's';
}

const ACTIONS = Object.assign(AUTO_ACTIONS,{
  'POST /{username}/auth/login': 'auth.login',
  'GET /{username}/profile/private': 'profile.get',
  'POST /accesses/check-app': 'check.app',
  'GET /robots.txt': false,
  'GET /favicon.ico': false,
  'GET /access-info': 'getAccessInfo',
  'POST /': 'callBatch',
  'GET /profile/private': 'profile.getPrivate',
  'GET /system/user-info/{username}': 'system.getUserInfo',
  'GET /followed-slices': 'followedSlices.get',
  'POST /followed-slices': 'followedSlices.create',
  'UPDATE /followed-slices': 'followedSlices.update',
  'DELETE /followed-slices': 'followedSlices.delete',
  'POST /auth/logout': 'auth.logout'
});


function methodIdForAction(action) {
  const saction = action.split(' ');
  if (saction[0] === 'OPTIONS') return null;
  const res = ACTIONS[action];
  if (res === false) { return false; }
  if (res === undefined) {
    console.log(action);
    return false;
  }
  return res;
}

function eventFromLine(line, username) {
  if (line.indexOf('message repeated') > 0 && line.indexOf('times: [') > 0) return false;

  const detailPos = line.indexOf('Details: ') + 9;
  if (detailPos < 0) {  throw new Error(line); }
  const data = JSON.parse(line.substr(detailPos));
  const methodId = methodIdForAction(data.action.replace(username, '{username}'));
  if (! methodId) return false;
  const event = {
    createdBy: 'system',
    streamIds: [audit.CONSTANTS.ACCESS_STREAM_ID_PREFIX + data.access_id, audit.CONSTANTS.ACTION_STREAM_ID_PREFIX + methodId],
    type: 'log/user-api',
    content: {
      source: 'http',
      action: methodId,
      query: data.query,
    }
  }
  //console.log(event);
  return event;
}

async function readLogs(username) {
  const files = await listAuditFilesForUser(username);
  for (let file of files) {
    try {
      await readFile(username, file);
    } catch (e) {
      console.log(e);
      process.exit(1);
    }
    console.log(file);
  }
  console.log('done');

  //console.log(files);
}



function connectToMongo() {
  const dbconf = config.get('database');
  const mongoConnectString = `mongodb://${dbconf.host}:${dbconf.port}/`;
  return new Promise((resolve, reject) => {
   MongoClient.connect(mongoConnectString, { useUnifiedTopology: true }, (err, client) => {
      if (err) return reject(err);
      resolve(client.db(dbconf.name));
    });
  });
}

async function getAuditLogDir() {
  return path.resolve(__dirname, '../../../../var-pryv/audit-logs/');
}

let db, config, audiLogsDirs, userIdMap = {};
async function start() {
  audiLogsDirs = await getAuditLogDir();
  config = await getConfig();
  db = await connectToMongo();
  usernames = await listDirectory(audiLogsDirs);
  for (let username of usernames) {
    userIdMap[username] = await userIdForusername(username);
    console.log(username, userIdMap[username]);
    await readLogs(username);


  }
}

(async () => {
  await start();
})()