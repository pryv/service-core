/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;

module.exports = CleanDeletedEventsStream;

/**
 * Some deleted event might have extra properties depending on delete mode
 * In thi seventuality we keep only the id and deleted property.
 * If we have to modifiy the structure we do remove also the integritity.
 * @constructor
 */
function CleanDeletedEventsStream() {
  Transform.call(this, {objectMode: true});
}

inherits(CleanDeletedEventsStream, Transform);

CleanDeletedEventsStream.prototype._transform = function (event, encoding, callback) {
  const keysCount = Object.keys(event).length;
  if (keysCount > 3 || (keysCount === 3 && event.integrity == null)) {
    this.push({ id: event.id, deleted: event.deleted });
  } else {
    this.push(event);
  }
  callback();
};
