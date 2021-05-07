/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const MongoClient = require('../../../../dist/node_modules/mongodb').MongoClient;


const Router = require('../../../../dist/node_modules/express').Router;
/// Load all Routes in a fake Express
const ROUTES = require('./routes');

const fs = require('fs');
const path = require('path');
const lineReader = require('line-reader');

const DistPath = '../../../../dist/';


// ---------------- CONFIG ----------//

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
const UserLocalDirectory = require(DistPath + 'components/business/src/users/UserLocalDirectory');



async function userIdForusername(username) {
  const res = await db.collection('events').findOne({'username__unique': username});
  if (!res) return null;
  return res.userId;
}

// -------------- FILES AND DIR (AUDIT) ------------ //

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
         if (item) {
           storeEvent(username, item);
         }
      } catch (e) {
        cb(false)
        reject(new Error('Error on file ' + file+':'+lineCount +' >>> '+ e.message + '\n' + line));
        return;
      }
      if (! item ) {
        //count++;
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

// ---------  EVENTS AND CONVERTERS ------------------------//


function storeEvent(username, event) {
  userStorageByUsername[username].createEvent(event);
}

// Load routes in a fake expressRouter
router = Router();

const IGNORES = [
  { methodId: false, path: '/:username/robots.txt', method: 'get' },
  { methodId: false, path: '/:username/favicon.ico', method: 'get' },
  { methodId: false, path: '/:username/socket.io', method: 'get' }
];

for (let r of ROUTES.concat(IGNORES)) {
  if (r.methodId !== undefined)
   router[r.method](r.path,  (req, res, next) => { res.methodId = r.methodId;});
}

router.get('/*', (req, res, next) => { console.log('IGNORED>', req.url, req.method); next(); });


const NOUSERNAME = ['/reg/', '/register/', '/system/'];
function addUserNameIfNeeded(saction, username) {
  for (let n of NOUSERNAME) {
    if (saction[1].startsWith( NOUSERNAME)) return;
  }
  if (! saction[1].startsWith('/' + username)) saction[1] = '/' + username + saction[1];
}

function methodIdForAction2(action, username) {
  const saction = action.split(' ');
  if (saction[0] === 'OPTIONS') return null;
  // add username if needed
  addUserNameIfNeeded(saction, username);
  const myRes = {};
  router.handle({ url: saction[1], method: saction[0] }, myRes, function() { });
  //console.log('******', saction, myRes);
  return myRes;
}

const INCOMING_REQUEST = 'Incoming request. Details: ';
const RESULT_LINE = ' Details: ';
const RESULT_LINE_L = RESULT_LINE.length - 1;
function eventFromLine(line, username) {
  if (line.indexOf(INCOMING_REQUEST) > 0) { 
    //console.log(line);
    return false; // skip
  }
  if (line.indexOf('message repeated') > 0 && line.indexOf('times: [') > 0) return false;

  const detailPos = line.indexOf(RESULT_LINE);
  if (detailPos < 0) {  
    throw new Error('CANNOT FIND DETAILS:'); 
  }
  const data = JSON.parse(line.substr(detailPos + RESULT_LINE_L));

  const time = (new Date(data.iso_date)).getTime() / 100;

  const methodId = methodIdForAction2(data.action, username);
  if (! methodId) {
    return false; // skip
  }
  const event = {
    createdBy: 'system',
    streamIds: [audit.CONSTANTS.ACTION_STREAM_ID_PREFIX + methodId],
    type: 'log/user-api',
    time: time,
    content: {
      source: {
        name: 'http',
        ip: data.forwarded_for
      },
      action: methodId,
      query: data.query,
    }
  }
  if (data.access_id) {
    event.streamIds.push(audit.CONSTANTS.ACCESS_STREAM_ID_PREFIX + data.access_id); 
  } 

  if (data.error_id) {
    event.content.error = {
      id: data.error_id,
    };
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

let db, config, audiLogsDirs, userIdMap = {}, userStorageByUsername = {};
async function start() {
  config = await getConfig();
  await audit.init();
  await UserLocalDirectory.init();
  audiLogsDirs = await getAuditLogDir();
  
  db = await connectToMongo();
  usernames = await listDirectory(audiLogsDirs);
  for (let username of usernames) {
    userIdMap[username] = await userIdForusername(username);
    userStorageByUsername[username] = await audit.storage.forUser(userIdMap[username]);
    console.log(username, userIdMap[username]);
    await readLogs(username);
    delete userStorageByUsername[username];

  }
}

(async () => {
  await start();
})()