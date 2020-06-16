/**
 * Regroups shared test data and related  helper functions.
 */

const async = require('async');
const childProcess = require('child_process');
const dependencies = require('./dependencies');
const mkdirp = require('mkdirp');

const { settings } = dependencies;
const { storage } = dependencies;
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const _ = require('lodash');

// users

const users = exports.users = require('./data/users');

const defaultUser = users[0];

exports.resetUsers = function (done) {
  async.series([
    function (stepDone) {
      storage.users.removeAll(stepDone);
    },
    function (stepDone) {
      storage.users.insertMany(users, stepDone);
    },
  ], done);
};

// accesses

const accesses = exports.accesses = require('./data/accesses');

exports.resetAccesses = function (done, user, personalAccessToken, addToId) {
  const u = user || defaultUser;
  if (personalAccessToken) {
    accesses[0].token = personalAccessToken;
  }
  if (addToId) {
    const data = JSON.parse(JSON.stringify(accesses));
    for (let i = 0; i < data.length; i++) {
      data[i].id += u.id;
    }
    resetData(storage.user.accesses, u, data, done);
    return;
  }
  resetData(storage.user.accesses, u, accesses, done);
};

// profile

const profile = exports.profile = require('./data/profile');

exports.resetProfile = function (done, user) {
  resetData(storage.user.profile, user || defaultUser, profile, done);
};

// followed slices

const followedSlicesURL = `http://${settings.http.ip}:${settings.http.port}/${
  users[0].username}`;
const followedSlices = exports.followedSlices = require('./data/followedSlices')(followedSlicesURL);

exports.resetFollowedSlices = function (done, user) {
  resetData(storage.user.followedSlices, user || defaultUser, followedSlices, done);
};

// events

const events = exports.events = require('./data/events');

exports.resetEvents = function (done, user) {
  resetData(storage.user.events, user || defaultUser, events, done);
};

// streams

const streams = exports.streams = require('./data/streams');

exports.resetStreams = function (done, user) {
  resetData(storage.user.streams, user || defaultUser, streams, done);
};

function resetData(storage, user, items, done) {
  async.series([
    storage.removeAll.bind(storage, user),
    storage.insertMany.bind(storage, user, items),
  ], done);
}

// attachments

/**
 * Source attachments directory path (!= server storage path)
 */
const attachmentsDirPath = exports.attachmentsDirPath = `${__dirname}/data/attachments/`;

const attachments = exports.attachments = {
  animatedGif: getAttachmentInfo('animatedGif', 'animated.gif', 'image/gif'),
  document: getAttachmentInfo('document', 'document.pdf', 'application/pdf'),
  document_modified: getAttachmentInfo('document', 'document.modified.pdf', 'application/pdf'),
  image: getAttachmentInfo('image', 'image (space and special chars).png', 'image/png'),
  imageBigger: getAttachmentInfo('imageBigger', 'image-bigger.jpg', 'image/jpeg'),
  text: getAttachmentInfo('text', 'text.txt', 'text/plain'),
};

function getAttachmentInfo(id, filename, type) {
  const filePath = path.join(attachmentsDirPath, filename);
  const data = fs.readFileSync(filePath);
  return {
    id,
    filename,
    path: filePath,
    data,
    size: data.length,
    type,
  };
}

exports.resetAttachments = function (done, user) {
  if (!user) {
    user = defaultUser;
  }
  async.series([
    function (stepDone) {
      storage.user.eventFiles.removeAllForUser(user, stepDone);
    },
    copyAttachmentFn(attachments.document, user, events[0].id),
    copyAttachmentFn(attachments.image, user, events[0].id),
    copyAttachmentFn(attachments.imageBigger, user, events[2].id),
    copyAttachmentFn(attachments.animatedGif, user, events[12].id),
  ], done);
};

function copyAttachmentFn(attachmentInfo, user, eventId) {
  return function (callback) {
    const tmpPath = `/tmp/${attachmentInfo.filename}`;
    try {
      childProcess.execSync(`cp "${attachmentInfo.path}" "${tmpPath}"`);
    } catch (e) {
      return callback(e);
    }
    storage.user.eventFiles.saveAttachedFile(tmpPath, user, eventId, attachmentInfo.id, callback);
  };
}

// data dump & restore (for testing data migration)

/**
 * Dumps test data into a `data` subfolder named after the provided version.
 * DB data is mongodumped, attachments data is tarballed.
 * The output folder will be overwritten if it already exists.
 *
 * @param {String} mongoFolder Path to MongoDB base folder
 * @param {Function} callback
 */
exports.dumpCurrent = function (mongoFolder, version, callback) {
  const mongodump = path.resolve(mongoFolder, 'bin/mongodump');
  const outputFolder = getDumpFolder(version);

  console.log(`Dumping current test data to ${outputFolder}`);

  async.series([
    clearAllData,
    storage.versions.migrateIfNeeded.bind(storage.versions),
    exports.resetUsers,
    exports.resetAccesses,
    exports.resetProfile,
    exports.resetFollowedSlices,
    exports.resetStreams,
    exports.resetEvents,
    exports.resetAttachments,
    rimraf.bind(null, outputFolder),
    childProcess.exec.bind(null, `${mongodump
        + (settings.database.authUser
          ? ` -u ${settings.database.authUser} -p ${settings.database.authPassword}` : '')
    } --host ${settings.database.host}:${settings.database.port
    } --db ${settings.database.name
    } --out ${getDumpDBSubfolder(outputFolder)}`),
    childProcess.exec.bind(null, `tar -C ${settings.eventFiles.attachmentsDirPath
    } -czf ${getDumpFilesArchive(outputFolder)} .`),
  ], (err) => {
    if (err) { return callback(err); }
    callback();
  });
};

/**
 *
 * @param {String} versionNum Must match an existing dumped version (e.g. "0.3.0")
 * @param {String} mongoFolder Path to MongoDB base folder
 * @param callback
 */
exports.restoreFromDump = function (versionNum, mongoFolder, callback) {
  const mongorestore = path.resolve(mongoFolder, 'bin/mongorestore');
  const sourceFolder = getDumpFolder(versionNum);
  const sourceDBFolder = getDumpDBSubfolder(sourceFolder);
  const sourceFilesArchive = getDumpFilesArchive(sourceFolder);

  console.log(`Restoring v${versionNum} data from ${sourceFolder}`);

  if (!fs.existsSync(sourceDBFolder) || !fs.existsSync(sourceFilesArchive)) {
    throw new Error(`Missing source dump or part of it at ${sourceFolder}`);
  }

  async.series([
    clearAllData,
    childProcess.exec.bind(null, `${mongorestore
        + (settings.database.authUser
          ? ` -u ${settings.database.authUser} -p ${settings.database.authPassword}` : '')
    } --host ${settings.database.host}:${settings.database.port
    } ${sourceDBFolder}`),
    function (done) {
      mkdirp.sync(settings.eventFiles.attachmentsDirPath);
      done();
    },
    childProcess.exec.bind(null, `tar -xzf ${sourceFilesArchive
    } -C ${settings.eventFiles.attachmentsDirPath}`),
  ], (err) => {
    if (err) { return callback(err); }
    console.log('OK');
    callback();
  });
};

/**
 * Fetches the database structure for a given version
 *
 * @param {String} version
 * @returns {Object} structure
 */
exports.getStructure = function (version) {
  return require(path.resolve(`${__dirname}/structure/${version}`));
};

function clearAllData(callback) {
  async.series([
    storage.database.dropDatabase.bind(storage.database),
    storage.user.eventFiles.removeAll.bind(storage.user.eventFiles),
  ], callback);
}

function getDumpFolder(versionNum) {
  return path.resolve(__dirname, 'data/dumps', versionNum);
}

function getDumpDBSubfolder(dumpFolder) {
  return path.resolve(dumpFolder, 'db');
}

function getDumpFilesArchive(dumpFolder) {
  return path.resolve(dumpFolder, 'event-files.tar.gz');
}
