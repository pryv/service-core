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


    this.permissions.forEach(function (perm) {
      if (perm.streamId) {
        this._loadStreamPermission(perm);
      } else if (perm.tag) {
        this._loadTagPermission(perm);
      } else if (perm.feature) {
        this._loadFeaturePermission(perm);
      }
    }.bind(this));

    // allow to read all tags if only stream permissions defined
    if (this.tagPermissions.length === 0 && this.streamPermissions.length > 0) {
      this._registerTagPermission({ tag: '*', level: 'read' });
    }
    // allow to read all streams if only tag permissions defined
    if (this.streamPermissions.length === 0 && this.tagPermissions.length > 0) {
      this._registerStreamPermission({ streamId: '*', level: 'read' });
    }

    //console.log('XXXX', this);
  }

  _loadStreamPermission (perm) {
    if (perm.streamId === '*') {
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

  canReadAccountStream (streamId) {
    if (streamId === '*') {
      return false;
    }
    const level = this._getAccountStreamPermissionLevel(streamId);
    if (level === 'create-only') return false;
    return level && isHigherOrEqualLevel(level, 'read');
  }

  // -- accesses.get
  canListAnyAccess() {
    return this.isPersonal();
  }




  /** ------------ EVENTS --------------- */

  canGetEventsOnStream (streamId, storeId) {
    if (this.isPersonal()) return true;
    if (SystemStreamsSerializer.isAccountStreamId(streamId)) {
      return this.canReadAccountStream(streamId);
    }
    if (storeId === '_audit') {
      console.log('XXXXX TO BE CHANGED > Authorizing audit streamId Query', streamId, storeId);
      if (streamId === 'access-' + this.id) return true;
      if (streamId.startsWith('action-')) return true;
      return false;
    }
    
    const level = this._getStreamPermissionLevel(streamId);
    if (level === null || level === 'create-only') return false;
    return isHigherOrEqualLevel(level, 'read');
  }

  canListStream (streamId) {
    if (this.isPersonal()) return true;
    const level = this._getStreamPermissionLevel(streamId);
    return level && isHigherOrEqualLevel(level, 'read');
  }

  canCreateChildOnStream(streamId) {
    return this._canManageStream(streamId);
  }

  canDeleteStream(streamId) {
    return this._canManageStream(streamId);
  }

  canUpdateStream(streamId) {
    return this._canManageStream(streamId);
  }

  /** @private internal  */
  _canManageStream (streamId) {
    if (this.isPersonal()) return true;
    const level = this._getStreamPermissionLevel(streamId || undefined);
    if (level === 'create-only') return false;
    return (level != null) && isHigherOrEqualLevel(level, 'manage');
  }

  canCreateEventsOnStream (streamId) {
    if (this.isPersonal()) return true;
    const level = this._getStreamPermissionLevel(streamId);
    return level && isHigherOrEqualLevel(level, 'contribute');
  }

  canUpdateEventsOnStream (streamId) {
    if (this.isPersonal()) return true;
    const level = this._getStreamPermissionLevel(streamId);
    if (level === 'create-only') return false;
    return this.canCreateEventsOnStream(streamId);
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
 canGetEventsOnStreamAndWithTags(streamId, tags) {
  if (this.isPersonal()) return true;
    return this.canGetEventsOnStream(streamId, 'local') &&
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
  canUpdateEventsOnStreamAndWIthTags(streamId, tags) {
    if (this.isPersonal()) return true;
    return this.canUpdateEventsOnStream(streamId) ||
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
  canCreateEventsOnStreamAndWIthTags(streamId, tags) {
    if (this.isPersonal()) return true;
    return this.canCreateEventsOnStream(streamId) ||
      (this._canCreateEventsWithTag('*') ||
        _.some(tags || [], this._canCreateEventsWithTag.bind(this)));
  }

  // Whether the current access delete manage the given access
  canDeleteAccess (access) {
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
  canCreateAccess (candidateAccess) {
    
    //TODO handle tags
    // The account owner can do everything. 
    if (this.isPersonal()) return true;
    // Shared accesses don't manage anything. 
    if (this.isShared()) return false;
    
    // assert: this.isApp()

    // Create a candidate to compare 
    const candidate = new AccessLogic(this._userId, candidateAccess);
      
    // App accesses can only manage shared accesses.
    if (! candidate.isShared()) return false;
    
    // assert: candidate.isShared()

    candidate.loadPermissions(this._cachedStreams);

   

    if (! hasPermissions(this) || ! hasPermissions(candidate)) {
      // can only manage shared accesses with permissions
      return false;
    }

    // Can candidate access streams that `this` cannot? Does it elevate the 
    // permissions on common streams? If yes, abort. 
    for (const candidateStreamPermission of candidate.streamPermissions) {
      const candidateStreamId = candidateStreamPermission.streamId;

      // Check if `this` contains a permission on the candidate streamId.
      // A permission on the root stream (*) matches any candidate streamId and takes precedence.
      const rootPermission = this.streamPermissionsMap['*'];
      const myStreamPermission = rootPermission || this.streamPermissionsMap[candidateStreamId];
        
      // If `this` cannot access the candidate stream, then don't give access.
      if (myStreamPermission == null) return false; 
      
      // The level of `this` must >= the level of candidate streams.
      const myLevel = myStreamPermission.level; 
      const candidateLevel = candidateStreamPermission.level; 

      if (isLowerLevel(myLevel, candidateLevel) || myLevel === 'create-only') {
        return false; 
      }

      // continue looking for problems...
    }

    // Can candidate access tags that `this` cannot? Does it elevate the 
    // permissions on common tags? If yes, abort. 
    for (const candidateTagPermission of candidate.tagPermissions) {
      const myTagPermission = this.tagPermissionsMap[candidateTagPermission.tag];
      
      // If `this` has no permission on tag, so doesn't candidate.
      if (myTagPermission == null) return false; 

      // The level of `this` must >= the level of candidate tags.
      const myLevel = myTagPermission.level; 
      const candidateLevel = candidateTagPermission.level; 
      if (isLowerLevel(myLevel, candidateLevel)) return false; 
      
      // continue looking for problems...
    }

    return true;
  }

  /**
   * @returns {String} `null` if no matching permission exists.
   */
  _getStreamPermissionLevel (streamId) {
    if (this.isPersonal()) {
      return 'manage';
    } else {
      // do not allow star permissions for account streams
      let permission;
      if (SystemStreamsSerializer.isAccountStreamId(streamId)) {
        permission = this.streamPermissionsMap[streamId];
      } else {
        permission = this.streamPermissionsMap[streamId] || this.streamPermissionsMap['*'];
      }
      return permission ? permission.level : null;
    }
  }

  /**
   * Identical to _getStreamPermissionLevel, just * permissions are not
   * allowed
   * @param {*} streamId 
   */
  _getAccountStreamPermissionLevel (streamId) {
    if (this.isPersonal()) {
      return 'manage';
    } else {
      var permission = this.streamPermissionsMap[streamId];
      return permission ? permission.level : null;
    }
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

function hasPermissions(access) {

  return access.permissions && access.permissions.length > 0 &&
    ((access.streamPermissions && access.streamPermissions.length > 0)
      || (access.tagPermissions && access.tagPermissions.length > 0));
}

