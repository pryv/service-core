/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { getConfig } = require('@pryv/boiler');
const EventLocalFiles = require('./EventLocalFiles');

module.exports = {
  getEventFiles
};

let eventFiles = null;

async function getEventFiles () {
  if (eventFiles) return eventFiles;

  const settings = (await getConfig()).get('eventFiles');
  if (settings.engine) {
    const EventEngine = require(settings.engine.modulePath);
    eventFiles = new EventEngine(settings.engine);
  } else {
    eventFiles = new EventLocalFiles();
  }
  await eventFiles.init();
  return eventFiles;
}
