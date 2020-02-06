/* global describe, before, beforeEach, afterEach, it */

require('./test-helpers');
const awaiting = require('awaiting');
const assert = require('chai').assert;
const Promise = require('bluebird');
const { context } = require('./test-helpers');

let server;
const Mock = require('./support/Mock');
const EventEmitter = require('events');
const eventEmitter = new EventEmitter();
const reportMock = {
  licenseName: 'pryv.io-test-license',
  role: 'core',
  templateVersion: '1.0.0'
};
const mock = new Mock('https://reporting.pryv.com', '/reports', 'POST', 200, reportMock, () => {
  eventEmitter.emit('report_received');
});

describe('service-reporting', () => {

  describe('POST report on service-reporting (started)', () => {
    beforeEach(async () => {
      server = await context.spawn();
    });

    afterEach(async () => {
      server.stop();
    });

    it('[G1UG] server must start and successfully send a report when service-reporting is listening', async () => {
      await awaiting.event(eventEmitter, 'report_received');
      assert.isNotEmpty(server.baseUrl); // Check the server has booted
    });
  });

  describe('POST opt-out and don\'t send report on service-reporting (started)', () => {
    beforeEach(async () => {
      const customSettings = {services: {reporting: {optOut: true}}};
      server = await context.spawn(customSettings);
    });

    afterEach(async () => {
      server.stop();
    });

    it('[UR7L] server must start and not send a report when opting-out reporting', async () => {
      await new Promise(async function (resolve) {
        await awaiting.event(eventEmitter, 'report_received');
        resolve();
      }).timeout(1000)
        .then(() => {
          throw new Error('Should not have received a report');
        })
        .catch(error => {
          if (error instanceof Promise.TimeoutError) {
            // Everything is ok, the promise should have timeouted
            // since the report has not been sent.
            assert.isNotEmpty(server.baseUrl); // Check the server has booted
          } else {
            assert.fail(error.message);
          }
        });
    });
  });

  describe('POST report on service-reporting (shut down)', () => {
    before(async () => {
      mock.stop();
    });

    beforeEach(async () => {
      server = await context.spawn();
    });
    
    afterEach(async () => {
      server.stop();
    });

    it('[H55A] server must start when service-reporting is not listening', async () => {
      assert.isNotEmpty(server.baseUrl); // Check the server has booted
    });
  });
});
