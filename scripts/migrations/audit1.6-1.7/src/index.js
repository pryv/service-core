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

// ---------------- username => ID ---------------//

async function userIdForusername(username) {
  const res = await db.collection('events').findOne({'username__unique': username});
  if (!res) return null;
  return res.userId;
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

// -------------- FILES AND DIR (AUDIT) ------------ //

async function listDirectory(logDiretory) {
  return new Promise((resolve, reject) => { 
    fs.readdir(logDiretory, {withFileTypes: true}, (err, fileTypes) => {
      if (err) return reject(err);
      resolve(fileTypes.filter( f => f.isDirectory()).map( d => d.name ));
    });
  });
}

// in reverse order !!  
function listAuditFilesForUser(username) {
  function getLogN(filname) {
    const s = filname.split('.');
    return parseInt(s[2]) || 0;
  }

  return new Promise((resolve, reject) => { 
    const userDir = path.resolve(audiLogsDirs, username);
    fs.readdir(userDir, {withFileTypes: true}, (err, fileTypes) => {
      if (err) return reject(err);
      resolve(fileTypes
        .filter( f => ! f.isDirectory() && f.name.startsWith('audit.log') )
        .map( d => d.name )
        .sort((first, second) => {
          return getLogN(second) - getLogN(first)
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


async function readLogs(username) {
  const files = await listAuditFilesForUser(username);
  for (let file of files) {
    try {
      await readFile(username, file);
    } catch (e) {
      console.log(e);
      process.exit(1);
    }
    console.log(file, userAnchor[username]);
  }
  console.log('done', userAnchor[username]);

  //console.log(files);
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

  const time = (new Date(data.iso_date)).getTime() / 1000;
  if (time <= userAnchor[username].lastSync) {
    userAnchor[username].skip++;
    return false;
  }
  //console.log('===', time, userAnchor[username].lastSync, time - userAnchor[username].lastSync, userAnchor[username]);
  userAnchor[username].count++;
  
  const methodId = methodIdForAction2(data.action, username);
  if (! methodId) {
    return false; // skip
  }
  const event = {
    createdBy: 'migration',
    streamIds: [audit.CONSTANTS.ACTION_STREAM_ID_PREFIX + methodId],
    type: audit.CONSTANTS.EVENT_TYPE_VALID,
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
    event.type = audit.CONSTANTS.EVENT_TYPE_ERROR;
    event.content.id = data.error_id;
    event.content.message = '';
  }


  //console.log(event);
  return event;
}

// -----------  Anchor --------- //

function getLastSynchedItem(username) {
  const res = userStorageByUsername[username].getLogs({limit: 1, sortAscending: false, createdBy: 'migration'});
  if (res[0] && res[0].time) { 
    userAnchor[username].lastSync = res[0].time; 
  }
}

function flagUserFullySynched(username) {

}

// --------- Arguments ------ //



async function getAuditLogDir() {
  const path = process.argv[2];
  if (! path || ! fs.lstatSync(path).isDirectory() ) { 
    console.error('Error: ' + path + ' is not a directory');
    console.log('Usage: node src/index.js <path to audit log dir (/var/log/pryv/audit/pryvio_core)>')
    process.exit(1);
  };
  return path;
}


// --- FLOW  


let db, config, audiLogsDirs, userIdMap = {}, userStorageByUsername = {}, userAnchor = {};
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
    userAnchor[username] = {lastSync: 0, skip: 0, count: 0};
    getLastSynchedItem(username);
    const synchInfo = userAnchor[username].lastSync ? (new Date(userAnchor[username].lastSync * 1000)) : '-';
    console.log('GO>', username, userIdMap[username], synchInfo);
    await readLogs(username);
    delete userStorageByUsername[username];

  }
}

(async () => {
  await start();
})()