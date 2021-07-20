/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const timestamp = require('unix-timestamp');
const _ = require('lodash');
import type { Access, User, Stream } from 'storage';

const AccessLogic = require('./accesses/AccessLogic');
const APIError = require('errors').APIError;
const errors = require('errors').factory;
const treeUtils = require('utils').treeUtils;
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getUsersRepository } = require('business/src/users');
import type { StorageLayer } from 'storage';

const storage = require('storage');
const { getStores, StreamsUtils } = require('stores');

const cache = require('cache');

export type CustomAuthFunctionCallback = (err: any) => void;
export type CustomAuthFunction = (MethodContext, CustomAuthFunctionCallback) => void;

export type ContextSourceName = 'http' | 'socket.io' | 'hf' | 'test';
export type ContextSource = {
  name: ContextSourceName,
  ip?: string
}


export type AuthenticationData = {
  accessToken: string,
  callerId?: string,
}

const AUTH_SEPARATOR = ' ';
const ACCESS_TYPE_PERSONAL = 'personal';




class MethodContext {
  // Username of the user making the request. 
  username: string;

  source: ContextSource;

  user: ?User;
  access: ?Access;
  streams: ?Array<Stream>;

  accessToken: ?string;
  callerId: ?string;
  headers: ?object; // used in custom auth function

  methodId: ?string; // API method id. Ex.: 'events.get'

  originalQuery: ?{};

  // Custom auth function, if one was configured. 
  customAuthStepFn: ?CustomAuthFunction;

  methodId: ?string;
  stores: Store;

  /**
   * Whether to disable or not some backward compatibility setting, originally for system stream id prefixes
   */
  disableBackwardCompatibility: boolean;

  constructor(
    source: ContextSource,
    username: string,
    auth: ?string,
    customAuthStepFn: ?CustomAuthFunction,
    eventsStorage: ?StorageLayer,
    headers: Map<string, any>,
    query: ?{},
  ) {
    this.source = source;
    this.username = username;

    this.user = null;
    this.stores = null;
    this.access = null;

    this.customAuthStepFn = customAuthStepFn;

    this.accessToken = null;
    this.callerId = null;
    this.headers = headers;

    this.methodId = null;
    SystemStreamsSerializer.getSerializer(); // ensure it's loaded
    if (auth != null) this.parseAuth(auth);
    this.originalQuery = _.cloneDeep(query);
    if (this.originalQuery?.auth) delete this.originalQuery.auth;
    if (headers != null) {
      this.disableBackwardCompatibility = headers['disable-backward-compatibility-prefix'] || false;
    }
  }

  // Extracts access token and optional caller id from the given auth string, 
  // assigning to `this.accessToken` and `this.callerId`.
  // 
  parseAuth(auth: string) {
    this.accessToken = auth;

    // Sometimes, the auth string will look like this: 
    //    'TOKEN CALLERID'
    // (where the ' ' in the middle is AUTH_SEPARATOR)
    const sepIndex = auth.indexOf(AUTH_SEPARATOR);
    if (sepIndex > 0) { // found, not at the start
      this.accessToken = auth.substring(0, sepIndex);
      this.callerId = auth.substring(sepIndex + 1);
    }
  }

  // Load the user identified by `this.username`, storing it in `this.user`.
  async retrieveUser() {
    try {
      this.stores = await getStores();
      // get user details
      const usersRepository = await getUsersRepository();
      this.user = await usersRepository.getAccountByUsername(this.username, true);
      if (!this.user) throw errors.unknownResource('user', this.username);
    } catch (err) {
      throw errors.unknownResource('user', this.username);
    }
  }

  // Retrieves the context's access from its token (auth in constructor) 
  //
  // If the context's access is already set, the initial step is skipped. This
  // allows callers to implement custom retrieval logic if needed (e.g. using a
  // read token for attached files).
  // 
  // This function throws/rejects for various reasons; but it will always throw
  // a subclass of APIError.
  // 
  async retrieveExpandedAccess (storage: StorageLayer) {
    try {
      if (this.access == null)
        await this.retrieveAccessFromToken(storage);

      const access = this.access;
      if (access == null) throw new Error('AF: this.access != null');

      // Check if the session is valid; touch it. 
      await this.checkSessionValid(storage);

      // Perform the custom auth step.
      const customAuthStep = this.customAuthStepFn;
      if (customAuthStep != null)
        await this.performCustomAuthStep(customAuthStep);

      // those 2 last are executed in callbatch for each call.

      // Load the streams we can access.
      if (!access.isPersonal()) access.loadPermissions();
    }
    catch (err) {
      if (err != null && !(err instanceof APIError)) {
        throw errors.unexpectedError(err);
      }

      // assert: err instanceof APIError
      throw err;
    }
  }

  // generic retrieve access
  async _retrieveAccess(storage: StorageLayer, query) {
    const access = await bluebird.fromCallback(
      cb => storage.accesses.findOne(this.user, query, null, cb));

    if (access == null)
      throw errors.invalidAccessToken(
        'Cannot find access from token.', 403);
      
    this.access = new AccessLogic(this.user.id, access);
    cache.set(cache.NS.ACCESS_LOGIC_BY_USERIDTOKEN, this.user.id + '/' + this.access.token, this.access);
    cache.set(cache.NS.ACCESS_LOGIC_BY_USERIDACCESSID, this.user.id + '/' + this.access.id, this.access);
  }

  // Internal: Loads `this.access`. 
  // 
  async retrieveAccessFromToken(storage: StorageLayer) {
    const token = this.accessToken;

    if (token == null)
      throw errors.invalidAccessToken(
        'The access token is missing: expected an ' +
        '"Authorization" header or an "auth" query string parameter.');

    this.access = cache.get(cache.NS.ACCESS_LOGIC_BY_USERIDTOKEN, this.user.id + '/' + token);
    
    if (this.access == null) { // retreiveing from Db
      await this._retrieveAccess(storage, {token: token})
    }
    this.checkAccessValid(this.access);
  }

  // Performs validity checks on the given access. You must call this after
  // every access load that needs to return a valid access. Internal function, 
  // since all the 'retrieveAccessFromToken*' methods call it. 
  // 
  // Returns nothing but throws if an error is detected.
  // 
  checkAccessValid(access: Access) {
    const now = timestamp.now();
    if (access.expires != null && now > access.expires)
      throw errors.forbidden(
        'Access has expired.');
  }

  // Loads an access by id or throw an error. On success, assigns to
  // `this.access` and `this.accessToken`. 
  // 
  async retrieveAccessFromId(storage: StorageLayer, accessId: string): Promise<Access> {

    this.access = cache.get(cache.NS.ACCESS_LOGIC_BY_USERIDACCESSID, this.user.id + '/' + accessId);

    if (this.access == null) {
      await this._retrieveAccess(storage, { id: accessId });
    }

    this.accessToken = this.access.token;
    this.checkAccessValid(this.access);
    return this.access;
  }

  // Loads session and touches it (personal sessions only)
  async checkSessionValid(storage: StorageLayer) {
    const access = this.access;

    if (access == null)
      throw new Error('AF: access != null');

    // Only 'personal' tokens expire - if it is not personal, abort. 
    if (access.type !== ACCESS_TYPE_PERSONAL) return;

    // assert: type === 'personal'
    const token = access.token;
    const session = await bluebird.fromCallback(
      cb => storage.sessions.get(token, cb));

    if (session == null)
      throw errors.invalidAccessToken('Access session has expired.', 403);

    // Keep the session alive (don't await, see below)
    // TODO Maybe delay/amortize this so that we don't write on every request?
    storage.sessions.touch(token, () => null);
  }

  // Perform custom auth step `customAuthStep`. Errors are caught and rethrown. 
  performCustomAuthStep(customAuthStep: CustomAuthFunction): Promise<void> {
    return new bluebird((res, rej) => {
      try {
        customAuthStep(this, (err) => {
          if (err != null) rej(
            errors.invalidAccessToken(`Custom auth step failed: ${err.message}`));

          res();
        });
      }
      catch (err) {
        // If the custom auth step throws a synchronous exception, then we dont
        // simply log an auth failure, but rather a server failure: 
        rej(errors.unexpectedError(`Custom auth step threw synchronously: ${err.message}`));
      }
    });
  }
  
  /**
   * Get a Stream for StreamId
   * @param {identifier} streamId 
   * @param {identifier} [storeId] - If storeId is null streamId should be fully scoped 
   * @returns 
   */
  async streamForStreamId(streamId: string, storeId: string) {
    return await this.stores.streams.getOne(this.user.id, streamId, storeId);
  }

  initTrackingProperties(item: any, authorOverride: ?string) {
    item.created = timestamp.now();
    item.createdBy = authorOverride || this.getTrackingAuthorId();

    return this.updateTrackingProperties(item, authorOverride);
  }

  updateTrackingProperties(updatedData: any, authorOverride: ?string) {
    updatedData.modified = timestamp.now();
    updatedData.modifiedBy = authorOverride || this.getTrackingAuthorId();
    return updatedData;
  }

  // Returns the authorId, formed by the access id and the callerId. 
  // 
  getTrackingAuthorId(): string {
    const access = this.access;
    if (access == null)
      throw new Error('Access needs to be retrieved first.');

    let authorId = access.id;
    if (this.callerId != null) {
      authorId += AUTH_SEPARATOR + this.callerId;
    }

    return authorId;
  }
}
module.exports = MethodContext;
