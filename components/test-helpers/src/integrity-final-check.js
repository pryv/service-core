/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Load all events and check if the "integrity" is OK
 */
const { getDatabase } = require('storage');
const { integrity } = require('business');
const bluebird = require('bluebird');
const { getConfig } = require('@pryv/boiler');

async function events () {
  if (!integrity.events.isActive) return;
  const database = await getDatabase();
  const cursor = await bluebird.fromCallback(cb => database.findCursor({ name: 'events' }, {}, {}, cb));
  const erroneousEvents = [];
  let andNMore = 0;
  while (await cursor.hasNext()) {
    const event = await cursor.next();
    event.id = event._id;
    delete event._id;
    delete event.userId;
    let originalId = null;
    if (event.headId != null) {
      if (!event.integrity) return; // ignore missing integrity on history
      originalId = event.id;
      event.id = event.headId;
      delete event.headId;
    }

    const errors = [];

    if (typeof event.duration !== 'undefined') {
      errors.push('unexpected duration prop');
    }

    if (event.integrity === undefined) {
      errors.push('event has no integrity property');
    } else {
      const i = integrity.events.compute(event).integrity;
      if (i !== event.integrity) {
        errors.push('expected integrity: ' + i);
      }
    }

    if (errors.length !== 0) {
      if (erroneousEvents.length < 3) {
        if (originalId != null) { event._originalId = originalId; }
        erroneousEvents.push({ event, errors });
      } else {
        andNMore++;
      }
    }
  }
  if (erroneousEvents.length > 0) {
    if (andNMore > 0) {
      erroneousEvents.push('... And ' + andNMore + ' More');
    }
    throw new Error('Integrity not respected for ' + JSON.stringify(erroneousEvents, null, 2));
  }
  // await bluebird.fromCallback(cb => database.deleteMany({name: 'events'}, {},cb));
}

async function accesses () {
  if (!integrity.accesses.isActive) return;
  const database = await getDatabase();
  const cursor = await bluebird.fromCallback(cb => database.findCursor({ name: 'accesses' }, {}, {}, cb));
  const erroneousAccess = [];
  let andNMore = 0;
  while (await cursor.hasNext()) {
    const access = await cursor.next();
    access.id = access._id;
    delete access._id;
    delete access.userId;

    const errors = [];

    if (access.integrity === undefined) {
      errors.push('access has no integrity property');
    } else {
      const i = integrity.accesses.compute(access).integrity;
      if (i !== access.integrity) {
        errors.push('expected integrity: ' + i);
      }
    }

    if (errors.length !== 0) {
      if (erroneousAccess.length < 3) {
        erroneousAccess.push({ access, errors });
      } else {
        andNMore++;
      }
    }
  }
  if (erroneousAccess.length > 0) {
    if (andNMore > 0) {
      erroneousAccess.push('... And ' + andNMore + ' More');
    }
    throw new Error('Integrity not respected for ' + JSON.stringify(erroneousAccess, null, 2));
  }
  // await bluebird.fromCallback(cb => database.deleteMany({name: 'events'}, {},cb));
}

let isOpenSource = null;

async function all () {
  if (isOpenSource === null) {
    const config = await getConfig();
    isOpenSource = config.get('openSource:isActive');
  }
  if (isOpenSource) return;
  await events();
  await accesses();
}

module.exports = { all };
