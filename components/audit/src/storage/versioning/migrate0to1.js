/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// Migration of v0 to 1 is done in the following steps:
// 1. Open v0
// 2. Copy events to v1
// 3. Delete v0 file

// We cannot simply update the schema as we cannot alter NULLABLE state of columns

// changes:
// - renamed duration to endTime
// - added deleted
// - added attachments
// changed most of the fields to be nullable
// - added headId

const sqlite3 = require('better-sqlite3');
const unlinkFilePromise = require('fs/promises').unlink;

async function migrate0to1(v0dbPath, v1user, logger) {
  const v0db = new sqlite3(v0dbPath);
  const v0EventsIterator = v0db.prepare('SELECT * FROM events').iterate;

  v1user.db.exec('BEGIN');
  for (let eventData of v0EventsIterator.iterate()) {
    if (eventData.duration) { // NOT null, 0, undefined
      eventData.endTime = eventData.time + eventData.duration; 
    } else { 
      eventData.endTime = eventData.time;
    
    }
    delete eventData.duration;
    $$(eventData);
    v1user.createEventSync(eventData);
  }
  v1user.db.exec('COMMIT');

  v0db.close();
  await unlinkFilePromise(v0dbPath);
}

module.exports = migrate0to1;