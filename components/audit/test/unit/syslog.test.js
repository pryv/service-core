/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global assert, cuid, app, auditProducer, config, initTests */

const SyslogWatch = require('../support/SyslogWatch');

describe('Syslog', () => {
  let userid = cuid();
  let createdBy = cuid();
  let syslogWatch;

  before(async () => {
    await initTests();
    syslogWatch = new SyslogWatch(config.get('audit:syslog:options:app_name'));
  });

  async function send(event) {
    const e = _.merge({
        type: 'log/test',
        createdBy: createdBy,
        streamIds: [':_audit:test'],
        content: {
          action: 'events.get',
          message: 'hello',
        }
      }, event);

    await audit.eventForUser(userid, e);
    return e;
  }

  describe('receive message and write them to syslog', () => { 

    it('[F8SH] default message', function (done) { 

      this.timeout(5000);
      const randomString = cuid();

      const logString = userid + 
      ' log/unkown createdBy:' + createdBy +
      ' [":_audit:test"] ' +  JSON.stringify({action: 'events.get', message: randomString});

      syslogWatch(
        function() { // syslog Watch is ready 
          send({type: 'log/unkown', content: {message: randomString}});
        },
        function(err, res) { // string found or err
          assert.notExists(err);
          assert.include(res, logString);
          done(err);
        });
    });

    it('[9S6A] templated message', function (done) { 

      this.timeout(5000);
      const randomString = cuid();

      const logString = userid + 
      ' log/test createdBy:' + createdBy +
      ' streamIds:[":_audit:test"] ' +  randomString;

      syslogWatch( 
        function() { // syslog Watch is ready 
          send({ content: {message: randomString}});
        },
        function(err, res) { // string found or err
          assert.notExists(err);
          assert.include(res, logString);
          done();
        });
    });


    it('[0PA7] plugin filtered message', function (done) { 

      this.timeout(5000);
      const randomString = cuid();

      const logString = userid + ' TEST FILTERED ' +  randomString;

      syslogWatch( 
        function() { // syslog Watch is ready 
          send({type: 'log/test-filtered', content: {message: randomString}});
        },
        function(err, res) { // string found or err
          assert.notExists(err);
          assert.include(res, logString);
          done();
        });
    });

    it('[1D5S] plugin filtered message (SKIP)', function (done) { 

      this.timeout(10000);
      const randomString = cuid();

      syslogWatch( 
        function() { // syslog Watch is ready 
          send({type: 'log/test-filtered', content: {skip: true, message: randomString}});
        },
        function(err, res) { // string found or err
          assert.exists(err);
          assert.equal(err.message, 'Not Found');
          done();
        });
    });

  });

});