/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global describe, it */

require('test-helpers/src/api-server-tests-config');
const { pubsub } = require('messages');

const { assert } = require('chai');

describe('Pubsub removers', function () {
  it('[LVNK] remover works', done => {
    const removable = pubsub.notifications.onAndGetRemovable('toto', messageReceived);
    let titiReceived = false;
    pubsub.notifications.emit('toto', 'titi');

    function messageReceived (msg) {
      assert.equal(msg, 'titi');
      titiReceived = true;
      removable();
      pubsub.notifications.emit('toto', 'tata'); // should not be received
    }

    setTimeout(() => {
      assert.isTrue(titiReceived, 'should have recived titi message');
      done();
    }, 50);
  });
});
