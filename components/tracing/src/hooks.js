/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// REF: https://stackabuse.com/using-async-hooks-for-request-context-handling-in-node-js

const asyncHooks = require('async_hooks');
const cuid = require('cuid');
const store = new Map();

const asyncHook = asyncHooks.createHook({
  init: (asyncId, _, triggerAsyncId) => {
    if (store.has(triggerAsyncId)) {
      store.set(asyncId, store.get(triggerAsyncId));
    }
  },
  destroy: (asyncId) => {
    if (store.has(asyncId)) {
      store.delete(asyncId);
    }
  }
});

asyncHook.enable();

const createRequestContext = (data, requestId = cuid()) => {
  const requestInfo = { requestId, data };
  store.set(asyncHooks.executionAsyncId(), requestInfo);
  return requestInfo;
};

const getRequestContext = () => {
  return store.get(asyncHooks.executionAsyncId());
};

module.exports = { createRequestContext, getRequestContext };
