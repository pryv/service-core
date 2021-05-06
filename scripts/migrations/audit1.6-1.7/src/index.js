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

  return new Promise((resolve) => { 
    let count = 0;
    lineReader.eachLine(file, function(line, last, cb) {
      const item = jsonFromLine(line);
      count++;
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


const ACTIONS = {
  'GET /streams': 'streams.get',
  'GET /events': 'events.get'
}
function methodIdForAction(action) {
  const res = ACTIONS[action];
  if (res) return res;
  console.log(action);
  return 'unkown';
}

function jsonFromLine(line) {
  const detailPos = line.indexOf('Details: ') + 9;
  if (detailPos < 0) {  throw new Error(line); }
  const data = JSON.parse(line.substr(detailPos));
  const methodId = methodIdForAction(data.action)
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
  console.log(event);
}

async function readLogs(username) {
  const files = await listAuditFilesForUser(username);

  await readFile(username, files[0]);


  console.log(files);
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