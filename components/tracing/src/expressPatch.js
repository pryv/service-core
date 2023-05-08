/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


module.exports = function patchApp(app, expressSpanName) {
  if (app.legacy_use != null) throw new Error('Already patched');

  app.legacy_use = app.use;
  app.use = function () {
    const newArgs = [];
    for (let i = 0; i < arguments.length; i++) {
      // !!!! doing nothing for now.. all attemp to patch "use" failed
      newArgs.push(patchFunction0(arguments[i]));
    }
    //console.log(arguments, newArgs);
    return app.legacy_use(...newArgs);
  }

  patch('get');
  patch('post');
  patch('put');
  patch('delete');

  function patch(key) {
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
      req.tracing.startSpan(spanName, {}, expressSpanName);
      return await fn(req, res, function nextCloseSpan(err) {
        req.tracing.finishSpan(spanName);
        next(err);
      });
    }
  }

  // doing nothing 
  function patchFunction0(fn) {
    console.log('>>>> unpatched: ', fn.name);
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

}