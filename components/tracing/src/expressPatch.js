/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


module.exports = function patchApp(app) {
  if (app.unpatchedUse != null) throw new Error('Already patched');

  app.unpatchedUse = app.use;
  app.use = function () {
    const newArgs = [];
    for (let i = 0; i < arguments.length; i++) {
      newArgs.push(patchFunction0(arguments[i]));
    }
    //console.log(arguments, newArgs);
    return app.unpatchedUse(...newArgs);
  }

  patch('get', app);
  patch('post', app);
  patch('put', app);
  patch('delete', app);
}



function patch(key, app) {
  app['legacy_' + key] = app[key];
  app[key] = function () {
    const newArgs = [arguments[0]];
    for (let i = 1; i < arguments.length; i++) {
      const fn = arguments[i];
      const spanName = 'e:' + key + ':' + arguments[0] + ':' + (fn.name || ('unamed.' + i));
      newArgs.push(patchFunction(fn, spanName));
    }
    return app['legacy_' + key](...newArgs);
  }
}

function patchFunction(fn, spanName) {
  return async function (req, res, next) {
    function nextCloseSpan(err) {
      req.tracing.finishSpan(spanName);
      next(err);
    }
    req.tracing.startSpan(spanName, {}, 'express1');
    try {
      return await fn(req, res, nextCloseSpan);
    } catch (e) {
      console.log('XXXX PatchError', e);
      req.tracing.finishSpan(spanName);
      throw e;
    }
  }
}

function patchFunction0(fn) {
  return fn;
}

// kept for reference
function patchFunction2(fn) {
  // return fn; 
  if (fn.constructor.name === 'AsyncFunction') {
    return async () => { try { return await fn.apply(null, arguments); } catch (e) { console.log('XXXX', e) } }
  }
  return () => { try { return fn.apply(null, arguments); } catch (e) { console.log(e) } }
}

