/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Load all events and check if the "integrity" is OK
 */
const { getDatabase } = require('storage');
const { integrity } = require('business');
const bluebird = require('bluebird');

async function events() {
  const database = await getDatabase();
  const cursor = await bluebird.fromCallback(cb => database.findCursor({ name: 'events' }, {}, {}, cb));
  const erroneousEvents = [];
  let and_N_more = 0;
  while (await cursor.hasNext()) {
    const event = await cursor.next();
    event.id = event._id;
    delete event._id;
    delete event.userId;

    const errors = [];

    if (typeof event.duration != 'undefined') {
      errors.push('unexpected duration prop');
    }

    if (event.integrity === undefined) {
      errors.push('event has no integrity property');
    } else {
      const i = integrity.events.compute(event).integrity;
      if (i != event.integrity) {
        errors.push('expected integrity: ' + i);
      }
    }


    if (errors.length != 0) {
      if (erroneousEvents.length < 3) {
        erroneousEvents.push({ event, errors });
      } else {
        and_N_more++;
      }
    }
  };
  if (erroneousEvents.length > 0) {
    if (and_N_more > 0) {
      erroneousEvents.push('... And ' + and_N_more + ' More');
    }
    throw new Error('Integrity not respected for ' + JSON.stringify(erroneousEvents, null, 2));
    console.log(new Error('integrity check'));
  }



  //await bluebird.fromCallback(cb => database.deleteMany({name: 'events'}, {},cb));
}


module.exports = { events };