/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const { Notifier } = require('@airbrake/node');

let airbrake;
let logger;

function setUpAirbrakeIfNeeded(config, rootLogger) {
  if (airbrake) {   
    rootLogger.debug('Skipping airBrake setup (already done)');
    return;
  }
  logger = rootLogger;

  const airBrakeSettings = config.get('logs:airbrake');
  if (airBrakeSettings.active) {
    airbrake = new Notifier({
      projectId: airBrakeSettings.projectId,
      projectKey: airBrakeSettings.key,
      environment: 'production',
    });
    logger.debug('Airbrake active with projectId: ', airBrakeSettings);
  }
  

  // Catch uncaught Promise rejections
  process.on('unhandledRejection', (reason) => {
    throw reason;
  });

  // Catch uncaught Exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('uncaughtException', error);
    await notifyAirbrake(error);
    if (process.env.NODE_ENV !== 'test') process.exit(1);
  });

}

async function notifyAirbrake() {
  if (airbrake != null && typeof airbrake.notify === 'function') {
    await airbrake.notify(...arguments);
  } else {
    logger.debug('Skipping notifyAirbake', ...arguments);
  }
}

module.exports = {
  setUpAirbrakeIfNeeded: setUpAirbrakeIfNeeded,
  notifyAirbrake: notifyAirbrake
}