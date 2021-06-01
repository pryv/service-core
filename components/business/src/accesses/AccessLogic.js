/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Business logic for access objects.
 */

var treeUtils = require('utils').treeUtils,
    _ = require('lodash');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getConfigUnsafe } = require('@pryv/boiler');
const { StreamsUtils, getStore } = require('stores');

let auditIsActive = null;
function addAuditStreams() {
  if (auditIsActive !== null) return  auditIsActive;
  auditIsActive = getConfigUnsafe().get('audit:active');
  return auditIsActive;
}

/**
 * Lists permission levels ordered by ascending level to help with permission assessment.
 */
var PermissionLevels = {
  'read': 0,
  'create-only': 1,
  'contribute': 1,
  'manage': 2,
};

Object.freeze(PermissionLevels);

 class AccessLogic {
  _access; // Access right from the DB
  _userId;

  constructor(userId, access) {
    this._access = access;
    this._userId = userId;
    _.merge(this, access);


    // add audit permissions
    if (! addAuditStreams()) return;
    if (this.isPersonal()) return;
    if (! this.id) return; // this is an access "in" creation process  
    
    if (! this.permissions) this.permissions = [];
    let selfAudit = true;
    for (let permission of this.permissions) {
      if (permission.feature === 'selfAudit' && permission.setting === 'forbidden') {
        selfAudit = false;
        break;
      }
    }
    if (selfAudit) {
      this.permissions.push({streamId: ':_audit:access-' + this.id , level: 'read'});
    }
  }
  
  isPersonal () {
    return this.type === 'personal';
  }

  isApp () {
    return this.type === 'app';
  }

  isShared () {
    return this.type === 'shared';
  }

  /**
   * Loads permissions from `this.permissions`.
   *
   * - Loads expanded streams permissions into `streamPermissions`/`streamPermissionsMap`
   *   using the given streams tree, filtering out unknown streams
   * - Loads tag permissions into `tagPermissions`/`tagPermissionsMap`.
   */
  loadPermissions (streams) {
    if (! this.permissions) {
      return;
    }
    // cache streams
    this._cachedStreams = streams;

    this.streamPermissions = [];
    this.streamPermissionsMap = {};
    this.tagPermissions = [];
    this.tagPermissionsMap = {};
    this.featurePermissions = [];
    this.featurePermissionsMap = {};

    // new permissionsMap[storeId][streamId]
    this._newStreamPermissionsMap = {};


    this.permissions.forEach(function (perm) {
      if (perm.streamId) {
        this._loadStreamPermission(perm);
        this._newLoadStreamPermission(perm);
      } else if (perm.tag) {
        this._loadTagPermission(perm);
      } else if (perm.feature) {
        this._loadFeaturePermission(perm);
      }
    }.bind(this));

    // allow to read all tags if only stream permissions defined
    if (! this.hasTagPermissions() && this.hasStreamPermissions()) {
      this._registerTagPermission({ tag: '*', level: 'read' });
    }
    // allow to read all streams if only tag permissions defined
    if (this.hasStreamPermissions() && ! this.hasTagPermissions()) {
      this._registerStreamPermission({ streamId: '*', level: 'read' });
    }

  }

  _newLoadStreamPermission (perm) {
    const [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(perm.streamId);
    if (! this._newStreamPermissionsMap[storeId]) this._newStreamPermissionsMap[storeId] = {}
    this._newStreamPermissionsMap[storeId][streamId] = {streamId: streamId, level: perm.level};
  }
  /**
   * returns the permissions for this store if it exists
   * @param {identifier} storeId 
   * @returns {Array<permission>}
   */
   getStorePermissions(storeId) {
    const storeStreamPermissionMap = this._newStreamPermissionsMap[storeId];
    if (! storeStreamPermissionMap) return [];
    return Object.values(storeStreamPermissionMap);
  }
  /**
   * returns the permission for this stream if it exists
   * @param {identifier} storeId 
   * @param {identifier} streamId 
   * @returns {permission}
   */
  getStreamPermission(storeId, streamId) {
    const storeStreamPermissionMap = this._newStreamPermissionsMap[storeId];
    if (! storeStreamPermissionMap) return null;
    return storeStreamPermissionMap[streamId];
  }
  /**
   * returns the account streams with Authorizations
   * @returns {Array<permission>}
   */
  getAccountStreamPermissions() {
    const localPerms = this._newStreamPermissionsMap['local'];
    if (! localPerms) return [];
    return Object.values(localPerms).filter(perm => SystemStreamsSerializer.isAccountStreamId(perm.streamId));
  }

  _loadStreamPermission (perm) {
    
    if (perm.streamId === '*') {
      this._registerStreamPermission(perm);
      return;
    }
    
    const [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(perm.streamId);
    if (storeId !== 'local') {
      //console.log('XXXX TRANSITIONAL TO BE RE-CODED', perm);
      this._registerStreamPermission(perm);
      return;
    }

    var expandedIds = treeUtils.expandIds(this._cachedStreams, [perm.streamId]);

    expandedIds.forEach(function (id) {
      var existingPerm = this.streamPermissionsMap[id];
      if (existingPerm && isHigherOrEqualLevel(existingPerm.level, perm.level)) {
        return;
      }

      var expandedPerm = id === perm.streamId ? perm : _.extend(_.clone(perm), {streamId: id});
      this._registerStreamPermission(expandedPerm);
    }.bind(this));
  }

  _registerStreamPermission (perm) {
    this.streamPermissions.push(perm);
    this.streamPermissionsMap[perm.streamId] = perm;
  }

  _loadFeaturePermission (perm) {
    // here we might want to check if permission is higher
    this._registerFeaturePermission(perm);
  }

  _registerFeaturePermission (perm) {
    this.featurePermissions.push(perm);
    this.featurePermissionsMap[perm.feature] = perm;
  }

  _loadTagPermission (perm) {
    var existingPerm = this.tagPermissionsMap[perm.tag];
    if (existingPerm && isHigherOrEqualLevel(existingPerm.level, perm.level)) {
      return;
    }
    this._registerTagPermission(perm);
  }

  _registerTagPermission (perm) {
    this.tagPermissions.push(perm);
    this.tagPermissionsMap[perm.tag] = perm;
  }

  /** ---------- GENERIC --------------- */

  can(methodId) {
    switch (methodId) {
      // -- Account
      case 'account.get':
      case 'account.update':
      case 'account.changePassword':
        return this.isPersonal();

      // -- Followed Slice
      case 'followedSlices.get':
      case 'followedSlices.create':
      case 'followedSlices.update':
      case 'followedSlices.delete':
        return this.isPersonal();

      // -- Accesses
      case 'accesses.checkApp':
        return this.isPersonal();
      case 'accesses.get':
      case 'accesses.create':
        return ! this.isShared();

      // -- Profile
      case 'profile.get':
      case 'profile.update':
        return this.isPersonal();
      
      // -- Webhooks
      case 'webhooks.create':
        return ! this.isPersonal();
      
      default:
        throw(new Error('Unkown method.id: ' + methodId));
    }
  }

  /** ----------- ACCESSES -------------- */

  canCreateAccessForAccountStream (permissionLevel) {
    return isHigherOrEqualLevel('contribute', permissionLevel);
  }

  // -- accesses.get
  canListAnyAccess() {
    return this.isPersonal();
  }




  /** ------------ EVENTS --------------- */

  async canGetEventsOnStream (streamId, storeId) {
    if (this.isPersonal()) return true;
   
    const fullStreamId = StreamsUtils.streamIdForStoreId(streamId, storeId);
    
    const level = await this._getStreamPermissionLevel(fullStreamId);
    if (level === null || level === 'create-only') return false;
    return isHigherOrEqualLevel(level, 'read');
  }

  async canListStream (streamId) {
    if (this.isPersonal()) return true;
    const level = await this._getStreamPermissionLevel(streamId);
    return level && isHigherOrEqualLevel(level, 'read');
  }

  async canCreateChildOnStream(streamId) {
    return await this._canManageStream(streamId);
  }

  async canDeleteStream(streamId) {
    return await this._canManageStream(streamId);
  }

  async canUpdateStream(streamId) {
    return await this._canManageStream(streamId);
  }

  /** @private internal  */
  async _canManageStream (streamId) {
    if (this.isPersonal()) return true;
    const level = await this._getStreamPermissionLevel(streamId || undefined);
    if (level === 'create-only') return false;
    return (level != null) && isHigherOrEqualLevel(level, 'manage');
  }

  async canCreateEventsOnStream (streamId) {
    if (this.isPersonal()) return true;
    const level = await this._getStreamPermissionLevel(streamId);
    return level && isHigherOrEqualLevel(level, 'contribute');
  }

  async canUpdateEventsOnStream (streamId) {
    if (this.isPersonal()) return true;
    const level = await this._getStreamPermissionLevel(streamId);
    if (level === 'create-only') return false;
    return await this.canCreateEventsOnStream(streamId);
  }

  canGetEventsWithAnyTag () {
    return this.isPersonal() || !!this._getTagPermissionLevel('*');
  }

  /** kept private as not used elsewhere */
  _canGetEventsWithTag (tag) {
    if (this.isPersonal()) return true;
    const level = this._getTagPermissionLevel(tag);
    if (level === 'create-only') return false;
    return level && isHigherOrEqualLevel(level, 'read');
  }

  /** kept private as not used elsewhere */
  _canCreateEventsWithTag (tag) {
    if (this.isPersonal()) return true;
    const level = this._getTagPermissionLevel(tag);
    return level && isHigherOrEqualLevel(level, 'contribute');
  }

  /** kept private as not used elsewhere */
  _canUpdateEventWithTag (tag) {
    if (this.isPersonal()) return true;
    const level = this._getTagPermissionLevel(tag);
    if (level === 'create-only') return false;
    return this._canCreateEventsWithTag(tag);
  }

  /*
  * Whether events in the given stream and tags context can be read.
  *
  * @param streamId
  * @param tags
  * @returns {Boolean}
  */
 async canGetEventsOnStreamAndWithTags(streamId, tags) {
  if (this.isPersonal()) return true;
    return await this.canGetEventsOnStream(streamId, 'local') &&
      (this.canGetEventsWithAnyTag() ||
        _.some(tags || [], this._canGetEventsWithTag.bind(this)));
  }

  /**
   * Whether events in the given stream and tags context can be updated/deleted.
   *
   * @param streamId
   * @param tags
   * @returns {Boolean}
   */
  async canUpdateEventsOnStreamAndWIthTags(streamId, tags) {
    if (this.isPersonal()) return true;
    return await this.canUpdateEventsOnStream(streamId) ||
      (this._canUpdateEventWithTag('*') ||
        _.some(tags || [], this._canUpdateEventWithTag.bind(this)));
  }

  /**
   * Whether events in the given stream and tags context can be created/updated/deleted.
   *
   * @param streamId
   * @param tags
   * @returns {Boolean}
   */
  async canCreateEventsOnStreamAndWIthTags(streamId, tags) {
    if (this.isPersonal()) return true;
    return await this.canCreateEventsOnStream(streamId) ||
      (this._canCreateEventsWithTag('*') ||
        _.some(tags || [], this._canCreateEventsWithTag.bind(this)));
  }

  // Whether the current access delete manage the given access
  async canDeleteAccess (access) {
    // The account owner can do everything. 
    if (this.isPersonal()) return true;
    // App and Shared accesses can delete themselves (selfRevoke)
    if (access.id === this.id) { 
      return this._canSelfRevoke();
    }

    if (this.isShared()) return false;

    // App token can delete the one they created
    return this.id === access.createdBy;
  }

  
  // Whether the current access can create the given access. 
  // 
  async canCreateAccess (candidate) {
    // The account owner can do everything. 
    if (this.isPersonal()) return true;
    // Shared accesses don't manage anything. 
    if (this.isShared()) return false;
   
    // App accesses can only manage shared accesses.
    if (candidate.type !== 'shared') return false;

    let hasStreamPermissions = false;
    for (let perm of candidate.permissions) {
      if (perm.streamId) {
        hasStreamPermissions = true;
        const myLevel = await this._getStreamPermissionLevel(perm.streamId);
        if (! myLevel || isLowerLevel(myLevel, perm.level) || myLevel === 'create-only') {
          return false; 
        }

      } else if (perm.tag) {
        const myTagPermission = this.tagPermissionsMap[perm.tag];
        const myLevel = myTagPermission?.level;
        if (! myLevel || isLowerLevel(myLevel, perm.level)) return false; 

      } else if (perm.feature) {
        const myFeaturePermission = this.featurePermissionsMap[perm.feature];
        const myValue = myFeaturePermission?.level;
        if (! myValue || myValue != perm.feature) return false;
      }
    }
    // can only manage shared accesses with permissions
    if (! hasStreamPermissions) return false;

    // all OK
    return true;
  }


  /**
   * new fashion to retrieve stream permissions
   * @param {identifier} streamIdFull :{storeId}:{streamId}
   * @param {boolean} noStar used by tags search .. should be deprecated
   * @returns {String}  `null` if no matching permission exists.
   */
  async _getStreamPermissionLevel (streamIdFull, noStar) {
    if (! streamIdFull) streamIdFull = '*'; // to be investgated why this happens

    if (this.isPersonal()) return 'manage';

    const [storeId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamIdFull);

    let currentStream = (streamId !== '*') ? streamId : null; 

    while (currentStream) {
      const permissions = this.getStreamPermission(storeId, currentStream);
      if (permissions) return permissions.level; // found
      
      // not found, look for parent
      const store = (await getStore()).sourceForId(storeId);
      const streams = await store.streams.get(this._userId, {id: currentStream, hideChildren: true});
      currentStream = (streams.length > 0) ? streams[0].parentId : null;
    } 
    
    // do not allow star permissions for account streams
    if (SystemStreamsSerializer.isAccountStreamId(streamId)) return null;
    
    const permissions = this.getStreamPermission(storeId, '*'); // found nothing finaly.. look for global access level if any
    return permissions ? permissions.level : null;
  }

  /**
   * @returns {String} `null` if no matching permission exists.
   */
  _getTagPermissionLevel (tag) {
    if (this.isPersonal()) {
      return 'manage';
    } else {
      var permission = this.tagPermissionsMap[tag] || this.tagPermissionsMap['*'];
      return permission ? permission.level : null;
    }
  }

  /**
   * return true is does not have "feature selfRevoke" permission with level "forbidden"
   */
  _canSelfRevoke () {
    if (this.featurePermissionsMap.selfRevoke == null) return true; // default allow
    return this.featurePermissionsMap.selfRevoke.setting !== 'forbidden';
  }

  hasStreamPermissions() {
    return Object.keys(this._newStreamPermissionsMap).length > 0;
  }

  hasTagPermissions() {
    return (this.tagPermissions && this.tagPermissions.length > 0);
  }
};

module.exports = AccessLogic;

AccessLogic.PERMISSION_LEVEL_CONTRIBUTE = 'contribute';
AccessLogic.PERMISSION_LEVEL_MANAGE = 'manage';
AccessLogic.PERMISSION_LEVEL_READ = 'read';
AccessLogic.PERMISSION_LEVEL_CREATE_ONLY = 'create-only';



function isHigherOrEqualLevel(permissionLevelA, permissionLevelB) {
  return PermissionLevels[permissionLevelA] >= PermissionLevels[permissionLevelB];
}
function isLowerLevel(permissionLevelA, permissionLevelB) {
  return ! isHigherOrEqualLevel(permissionLevelA, permissionLevelB);
}

