/**
 * Business logic for access objects.
 */

var treeUtils = require('components/utils').treeUtils,
    _ = require('lodash');

/**
 * Lists permission levels ordered by ascending level to help with permission assessment.
 */
var PermissionLevels = {
  'read': 0,
  'contribute': 1,
  'manage': 2
};
Object.freeze(PermissionLevels);

/**
 * Usage example: _.extend(plainAccessObject, accessLogic);
 */
var accessLogic = module.exports = {

  isPersonal: function () {
    return this.type === 'personal';
  },

  isApp: function () {
    return this.type === 'app';
  },

  isShared: function () {
    return this.type === 'shared';
  },

  /**
   * Loads permissions from `this.permissions`.
   *
   * - Loads expanded streams permissions into `streamPermissions`/`streamPermissionsMap`
   *   using the given streams tree, filtering out unknown streams
   * - Loads tag permissions into `tagPermissions`/`tagPermissionsMap`.
   */
  loadPermissions: function (streams) {
    if (! this.permissions) {
      return;
    }

    // cache streams
    this._cachedStreams = streams;

    this.streamPermissions = [];
    this.streamPermissionsMap = {};
    this.tagPermissions = [];
    this.tagPermissionsMap = {};

    this.permissions.forEach(function (perm) {
      if (perm.streamId) {
        this._loadStreamPermission(perm);
      } else if (perm.tag) {
        this._loadTagPermission(perm);
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
  },

  _loadStreamPermission: function (perm) {
    if (perm.streamId === '*') {
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
  },

  _registerStreamPermission: function (perm) {
    this.streamPermissions.push(perm);
    this.streamPermissionsMap[perm.streamId] = perm;
  },

  _loadTagPermission: function (perm) {
    var existingPerm = this.tagPermissionsMap[perm.tag];
    if (existingPerm && isHigherOrEqualLevel(existingPerm.level, perm.level)) {
      return;
    }
    this._registerTagPermission(perm);
  },

  _registerTagPermission: function (perm) {
    this.tagPermissions.push(perm);
    this.tagPermissionsMap[perm.tag] = perm;
  },

  canReadAllStreams: function () {
    return this.isPersonal() || !! this.getStreamPermissionLevel('*');
  },

  canReadStream: function (streamId) {
    var level = this.getStreamPermissionLevel(streamId);
    return level && isHigherOrEqualLevel(level, 'read');
  },

  canContributeToStream: function (streamId) {
    var level = this.getStreamPermissionLevel(streamId);
    return level && isHigherOrEqualLevel(level, 'contribute');
  },

  canManageStream: function (streamId) {
    var level = this.getStreamPermissionLevel(streamId || undefined);
    return level && isHigherOrEqualLevel(level, 'manage');
  },

  canReadAllTags: function () {
    return this.isPersonal() || !! this.getTagPermissionLevel('*');
  },

  canReadTag: function (tag) {
    var level = this.getTagPermissionLevel(tag);
    return level && isHigherOrEqualLevel(level, 'read');
  },

  canContributeToTag: function (tag) {
    var level = this.getTagPermissionLevel(tag);
    return level && isHigherOrEqualLevel(level, 'contribute');
  },

  canManageTag: function (tag) {
    var level = this.getTagPermissionLevel(tag);
    return level && isHigherOrEqualLevel(level, 'manage');
  },

  /**
   * Whether the current access (personal or app) can see and manage the given access.
   */
  canManageAccess: function (access) {
    //TODO handle tags
    if (this.isPersonal()) { return true; }
    else if (this.isShared() || access.type !== 'shared') { return false; }

    var loadedAccess = _.extend(_.cloneDeep(access), accessLogic);

    if (! loadedAccess.isShared() || ! hasPermissions(this) || ! hasPermissions(access)) {
      // can only manage shared accesses with permissions
      return false;
    }

    loadedAccess.loadPermissions(this._cachedStreams);

    var checkedPerm, ownPerm;

    // check stream permissions
    for (var is = 0, ns = loadedAccess.streamPermissions.length; is < ns; is++) {
      checkedPerm = loadedAccess.streamPermissions[is];
      ownPerm = this.streamPermissionsMap[checkedPerm.streamId];

      if (! ownPerm || ! isHigherOrEqualLevel(ownPerm.level, checkedPerm.level)) {
        return false;
      }
    }

    // check tag permissions
    for (var it = 0, nt = loadedAccess.tagPermissions.length; it < nt; it++) {
      checkedPerm = loadedAccess.tagPermissions[it];
      ownPerm = this.tagPermissionsMap[checkedPerm.tag];

      if (! ownPerm || ! isHigherOrEqualLevel(ownPerm.level, checkedPerm.level)) {
        return false;
      }
    }

    return true;
  },

  /**
   * @returns {String} `null` if no matching permission exists.
   */
  getStreamPermissionLevel: function (streamId) {
    if (this.isPersonal()) {
      return 'manage';
    } else {
      var permission = this.streamPermissionsMap[streamId] || this.streamPermissionsMap['*'];
      return permission ? permission.level : null;
    }
  },

  /**
   * @returns {String} `null` if no matching permission exists.
   */
  getTagPermissionLevel: function (tag) {
    if (this.isPersonal()) {
      return 'manage';
    } else {
      var permission = this.tagPermissionsMap[tag] || this.tagPermissionsMap['*'];
      return permission ? permission.level : null;
    }
  }

};

function isHigherOrEqualLevel(permissionLevelA, permissionLevelB) {
  return PermissionLevels[permissionLevelA] >= PermissionLevels[permissionLevelB];
}

function hasPermissions(access) {
  return access.permissions && access.permissions.length > 0;
}
