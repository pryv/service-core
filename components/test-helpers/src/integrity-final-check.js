/**
 * Load all events and check if the "integrity" is OK
 */
const { getDatabase } = require('storage');
const { integrity } = require('business');
const bluebird = require('bluebird');

async function events() {
  const database = await getDatabase();
  const cursor = await bluebird.fromCallback(cb => database.findCursor({name: 'events'}, {}, {},cb));
  const erroneousEvents = [];
  while (await cursor.hasNext()) {
  const event = await cursor.next();
    event.id = event._id;
    delete event._id;
    delete event.userId;
    if (event.endTime) {
      if (! event.duration) {
        event.duration = event.endTime - event.time;
        console.log('NNNN Added duration to', event);
      }
      delete event.endTime;
    }
    const i = integrity.forEvent(event).integrity;
    if (i != event.integrity) { 
      erroneousEvents.push(event);
    }
  };
  if (erroneousEvents.length > 0)
    throw new Error('Integrity not respected for ' +  JSON.stringify(erroneousEvents, null, 2));
}


module.exports = { events };