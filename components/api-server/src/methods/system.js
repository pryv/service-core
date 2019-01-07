const errors = require('components/errors').factory;
const commonFns = require('./helpers/commonFunctions');
const mailing = require('./helpers/mailing');
const errorHandling = require('components/errors').errorHandling;
const methodsSchema = require('../schema/systemMethods');
const string = require('./helpers/string');
const _ = require('lodash');
const async = require('async');
const cuid = require('cuid');

/**
 * @param systemAPI
 * @param usersStorage
 * @param userAccessesStorage
 * @param servicesSettings Must contain `email`
 * @param api The user-facing API, used to compute usage stats per method
 * @param logging
 * @param storageLayer
 */
module.exports = function (
  systemAPI, usersStorage, userAccessesStorage, servicesSettings, api, logging, storageLayer
) {

  var logger = logging.getLogger('methods/system');
  const POOL_USERNAME_PREFIX = 'pool@';
  const POOL_REGEX = new RegExp( '^'  + POOL_USERNAME_PREFIX);

  // ---------------------------------------------------------------- createUser
  systemAPI.register('system.createUser',
    commonFns.getParamsValidation(methodsSchema.createUser.params),
    applyDefaultsForCreation,
    createUser,
    sendWelcomeMail);

  function applyDefaultsForCreation(context, params, result, next) {
    params.storageUsed = {
      dbDocuments: 0,
      attachedFiles: 0
    };
    next();
  }

  function createUser(context, params, result, next) {
    if (params.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user = _.defaults({id: result.id}, params);
      next();
    } else {
      // Consume a pool user if available or use default creation
      createUserOrConsumePool(params, (err, user) => {
        if (err != null) return next(handleCreationErrors(err, params));
        result.id = user.id;
        context.user = user;
        next();
      });
    }
  }

  function createUserOrConsumePool(userInfo, callback) {
    // Try to consume a user from pool
    usersStorage.findOneAndUpdate({username: {$regex : POOL_REGEX}},
      userInfo, (err, updatedUser) => {
        // Fallback to default user creation in case of error or empty pool
        if (err != null || updatedUser == null) {
          usersStorage.insertOne(userInfo, (err, newUser) => {
            if (err != null) return callback(err);
            // Init and return new user
            initUserRepositories(newUser, callback);
          });
        }
        else {        
          callback(null, updatedUser);
        }
      }
    );
  }

  function initUserRepositories(user, callback) {
    const repositories = [storageLayer.accesses, storageLayer.events,
      storageLayer.followedSlices, storageLayer.profile, storageLayer.streams];
    // Init user's repositories (create collections and indexes)
    async.each(repositories, (repository, stepDone) => {
      repository.initCollection(user, stepDone);
    }, (err) => {
      if (err != null) return callback(err);
      // Return initialized user
      callback(null, user);
    });
  }

  function handleCreationErrors(err, params) {
    const message = err.message;
    const isKeyCollision = 
      /^E11000/.test(message) && 
      /duplicate key error/.test(message);

    if (isKeyCollision) {
      // Extract the field that we collided in
      const md = message.match(/index: (\w+) dup key:/);
      const field = md[1];

      switch (field) {
        // MongoError: E11000 duplicate key error collection: pryv-node.users index: email_1 dup key: { : "zero@test.com" }
        case 'email_1':
          return errors.itemAlreadyExists('user', { email: params.email }, err);

        // E11000 duplicate key error collection: pryv-node.users index: username_1 dup key: { : "userzero" }
        case 'username_1': 
          return errors.itemAlreadyExists('user', { username: params.username }, err);

        // FALLTHROUGH
      }
    }

    return errors.unexpectedError(err, 'Unexpected error while saving user.');
  }

  function sendWelcomeMail(context, params, result, next) {
    const emailSettings = servicesSettings.email;

    // Skip this step if welcome mail is deactivated
    const isMailActivated = emailSettings.enabled;
    if (isMailActivated === false || 
       (isMailActivated != null && isMailActivated.welcome === false)) {
      return next();
    }
    
    const recipient = {
      email: context.user.email,
      name: context.user.username,
      type: 'to'
    };
    
    const substitutions = {
      USERNAME: context.user.username,
      EMAIL: context.user.email
    };
    
    mailing.sendmail(emailSettings, emailSettings.welcomeTemplate, recipient, 
      substitutions, context.user.language, (err) => {
        // Don't fail creation process itself (mail isn't critical), just log error
        if (err) {
          errorHandling.logError(err, null, logger);
        }
        
        next();
      });
  }

  // ------------------------------------------------------------ createPoolUser
  systemAPI.register('system.createPoolUser',
    commonFns.getParamsValidation(methodsSchema.createPoolUser.params),
    applyDefaultsForCreation,
    createPoolUser);
  
  function createPoolUser(context, params, result, next) {
    const username = POOL_USERNAME_PREFIX + cuid();
    const poolUser = {
      username: username,
      passwordHash: 'changeMe',
      language: 'en',
      email: username+'@email'
    };
    usersStorage.insertOne(poolUser, (err, newUser) => {
      if (err != null) return next(handleCreationErrors(err, params));

      initUserRepositories(newUser, function (err, user) {
        if (err) return next(err);
        result.id = user.id;
        context.user = newUser;
        return next();
      });
    });
  }

  // ---------------------------------------------------------- getUsersPoolSize
  systemAPI.register('system.getUsersPoolSize',
    //commonFns.getParamsValidation(methodsSchema.createPoolUser.params),
    applyDefaultsForCreation,
    countPoolUsers);

  function countPoolUsers(context, params, result, next) {
    usersStorage.count({username: { $regex : POOL_REGEX}},
      (err, size) => {
        if (err != null || size == null) return next(errors.unexpectedError(err));

        result.size = size;
        next();
      });
  }

  // --------------------------------------------------------------- getUserInfo
  systemAPI.register('system.getUserInfo',
    commonFns.getParamsValidation(methodsSchema.getUserInfo.params),
    retrieveUser,
    getUserInfoInit,
    getUserInfoSetAccessStats);

  function retrieveUser(context, params, result, next) {
    usersStorage.findOne({username: params.username}, null, function (err, user) {
      if (err) { return next(errors.unexpectedError(err)); }
      if (! user) {
        return next(errors.unknownResource('user', this.username));
      }

      context.user = user;
      next();
    });
  }

  function getUserInfoInit(context, params, result, next) {
    result.userInfo = {
      username: context.user.username,
      storageUsed: context.user.storageUsed
    };
    next();
  }

  function getUserInfoSetAccessStats(context, params, result, next) {
    const info = _.defaults(result.userInfo, {
      lastAccess: 0,
      callsTotal: 0,
      callsDetail: {},
      callsPerAccess: {}
    });
    getAPIMethodKeys().forEach(function (methodKey) {
      info.callsDetail[methodKey] = 0;
    });
    const userAccessesStorage = storageLayer.accesses;
    userAccessesStorage.find(context.user, {}, null, function (err, accesses) {
      if (err) { return next(errors.unexpectedError(err)); }

      accesses.forEach(function (access) {
        if (access.lastUsed > info.lastAccess) {
          info.lastAccess = access.lastUsed;
        }

        var accessKey = getAccessStatsKey(access);
        if (! info.callsPerAccess[accessKey]) {
          info.callsPerAccess[accessKey] = 0;
        }
        if (access.calls) {
          _.forOwn(access.calls, function (total, methodKey) {
            info.callsTotal += total;
            info.callsDetail[methodKey] += total;
            info.callsPerAccess[accessKey] += total;
          });
        }
      });
      
      // Since we've merged new keys into _the old userInfo_ on result, we don't
      // need to return our result here, since we've modified the result in 
      // place. 

      next();
    });
  }

  function getAPIMethodKeys() {
    return api.getMethodKeys().map(string.toMongoKey); 
  }

  function getAccessStatsKey(access) {
    if (access.type === 'shared') {
      // don't leak user private data
      return 'shared';
    } else {
      return access.name;
    }
  }

};
module.exports.injectDependencies = true;
