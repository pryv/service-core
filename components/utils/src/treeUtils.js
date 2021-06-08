/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Helper methods for handling tree object structures.
 * Here 'tree' means a recursive array of objects with a 'children' property.
 */

var _ = require('lodash');

/**
 * Items whose parent id refer to an item absent from the array are filtered out.
 * Items with no parent id are just left as they are.
 *
 * @param {Boolean} stripParentIds Optional, default: false
 */
exports.buildTree = function (array, stripParentIds) {
  if (! _.isArray(array)) {
    throw new Error('Invalid argument: expected an array');
  }

  var map = {};
  array.forEach(function (item) {
    verifyFlatItem(item);

    var clone = _.clone(item);
    if (item.hasOwnProperty('parentId')) {
      clone.children = [];
    }
    map[item.id] = clone;
  });

  var result = [];
  array.forEach(function (item) {
    var clone = map[item.id];

    if (clone.hasOwnProperty('parentId') && clone.parentId) {
      // child
      if (! map[clone.parentId]) {
        // missing parent -> ignore
        return;
      }
      map[clone.parentId].children.push(clone);
    } else {
      // root
      result.push(clone);
    }

    if (stripParentIds && clone.hasOwnProperty('parentId')) {
      delete clone.parentId;
    }
  });
  return result;
};

function verifyFlatItem(item) {
  if (! item.hasOwnProperty('id')) {
    throw new Error('Invalid object structure: expected property "id"');
  }
}

exports.flattenTreeWithoutParents = function (array) {
  if (!_.isArray(array)) {
    throw new Error('Invalid argument: expected an array');
  }

  const result = [];
  flattenRecursiveWithoutParents(array, null, result);
  return result;
};

function flattenRecursiveWithoutParents (originalArray, parentId, resultArray) {
  originalArray.forEach(function (item) {
    const clone = _.clone(item);

    clone.parentId = parentId; // WTF
    const children = clone.children;
    if (Array.isArray(children) && children.length > 0) {
      flattenRecursive(clone.children, clone.id, resultArray);
      delete clone.children; // WTF #2
    } else {
      resultArray.push(clone);
    }
  });
}

/**
 * Takes object in structure like this:
 * {
 *  username: myusername,
 *  storageUsed: {
 *    dbDocuments: 1,
 *    attachedFiles: 3
 *  }
 * }
 * 
 * and converts it to:
 *  username: myusername,
 *  dbDocuments: 1,
 *  attachedFiles: 3
 * }
 * @param {*} object 
 */
exports.flattenSimpleObject = function (object) {
  if (!_.isObject(object)) {
    throw new Error('Invalid argument: expected an object');
  }

  var result = [];
  flattenRecursiveSimpleObject(object, result);
  return result;
};

function flattenRecursiveSimpleObject (originalObject, resultArray: []): void {
  Object.keys(originalObject).forEach(function (key) {
    var value = _.clone(originalObject[key]);
    if (typeof value == 'object') {
      flattenRecursiveSimpleObject(value, resultArray);
    } else {
      resultArray[key] = value;
    }
  });
}

exports.flattenTree = function (array) {
  if (! _.isArray(array)) {
    throw new Error('Invalid argument: expected an array');
  }

  var result = [];
  flattenRecursive(array, null, result);
  return result;
};

function flattenRecursive(originalArray, parentId, resultArray) {
  originalArray.forEach(function (item) {
    var clone = _.clone(item);

    clone.parentId = parentId;
    resultArray.push(clone);
    if (clone.hasOwnProperty('children')) {
      flattenRecursive(clone.children, clone.id, resultArray);
      delete clone.children;
    }
  });
}

var findById = exports.findById = function (array, id) {
  return findInTree(array, function (item) {
    return item.id === id;
  });
};

/**
 * @param {Function} iterator Arguments: ({Object}), return value: {Boolean}
 */
var findInTree = exports.findInTree = function (array, iterator) {
  for (var i = 0, n = array.length; i < n; i++) {
    var item = array[i];
    // check if item matches
    if (iterator(item)) {
      return item;
    }
    // if not check its children if any
    if (item.hasOwnProperty('children')) {
      var childrenFind = findInTree(item.children, iterator);
      if (childrenFind) {
        return childrenFind;
      }
    }
  }
  // not found
  return null;
};

/**
 * Iterate on Tree, if iterator returns false, do not inspect children
 * @param {Function} iterator Arguments: ({Object}), return value: {Boolean}
 */
const iterateOnPromise = exports.iterateOnPromise = async function(array, iterator) {
  if (! array) return;
  for (let stream of array) {
    if ((await iterator(stream)) && stream.children) 
      await iterateOnPromise(stream.children, iterator);
  }
}

/**
 * @async 
 * @param {Boolean} keepOrphans Whether to take into account the children of filtered-out items
 *                              (if yes, the tree structure may be modified)
 * @callback {Promise<boolean>} iterator Arguments: ({Object}), return value: {Boolean}
 */
 var filterTreeOnPromise = exports.filterTreeOnPromise = async function (array, keepOrphans, iterator) {
  var filteredArray = [];

  for (var i = 0, n = array.length; i < n; i++) {
    var item = array[i];
    if (await iterator(item)) {
      var clone = _.clone(item);
      filteredArray.push(clone);
      if (clone.hasOwnProperty('children')) {
        clone.children = await filterTreeOnPromise(clone.children, keepOrphans, iterator);
      }
    } else if (item.hasOwnProperty('children') && keepOrphans) {
      const res = await filterTreeOnPromise(item.children, keepOrphans, iterator);
      filteredArray.push(...res);
    }
  }

  return filteredArray;
};

/**
 * @param {Boolean} keepOrphans Whether to take into account the children of filtered-out items
 *                              (if yes, the tree structure may be modified)
 * @param {Function} iterator Arguments: ({Object}), return value: {Boolean}
 */
var filterTree = exports.filterTree = function (array, keepOrphans, iterator) {
  var filteredArray = [];

  for (var i = 0, n = array.length; i < n; i++) {
    var item = array[i];
    if (iterator(item)) {
      var clone = _.clone(item);
      filteredArray.push(clone);
      if (clone.hasOwnProperty('children')) {
        clone.children = filterTree(clone.children, keepOrphans, iterator);
      }
    } else if (item.hasOwnProperty('children') && keepOrphans) {
      filteredArray.push.apply(filteredArray, filterTree(item.children, keepOrphans, iterator));
    }
  }

  return filteredArray;
};

var collect = exports.collect = function (array, iterator) {
  if (! _.isArray(array)) {
    throw new Error('Invalid argument: expected an array');
  }

  var result = [];
  collectRecursive(array, result, iterator);
  return result;
};

var collectFromRootItem = exports.collectFromRootItem = function (item, iterator) {
  if (_.isArray(item)) {
    throw new Error('Invalid argument: expected a single item');
  }

  var result = [ iterator(item) ];
  collectRecursive(item.children, result, iterator);
  return result;
};

function collectRecursive(originalArray, resultArray, iterator) {
  originalArray.forEach(function (item) {
    resultArray.push(iterator(item));
    if (item.hasOwnProperty('children')) {
      collectRecursive(item.children, resultArray, iterator);
    }
  });
}

exports.collectPluck = function (array, propertyName) {
  return collect(array, function (item) {
    return item[propertyName];
  });
};

var collectPluckFromRootItem = exports.collectPluckFromRootItem = function (item, propertyName) {
  return collectFromRootItem(item, function (item) {
    return item[propertyName];
  });
};

/**
 * Returns an array with the given ids plus those of their descendants, excluding unknown ids but
 * including `null` if present.
 *
 * @param {Array} ids
 */
exports.expandIds = function (array, ids) {
  var expandedIds = [];
  ids.forEach(function (id) {
    var currentExpIds;
    if (id === null) {
      // just keep it
      currentExpIds = [null];
    } else {
      var item = findById(array, id);
      if (! item) {
        return;
      }
      currentExpIds = collectPluckFromRootItem(item, 'id');
    }
    expandedIds.push.apply(expandedIds, currentExpIds);
  });
  return expandedIds;
};

/**
 * Applies "iterator" function to all elements of the array and its children
 */
exports.apply = function (array, iterator) {
  const result = [];
  array.forEach(item => {
    const clone = _.clone(item);
    result.push(applyRecursive(iterator(clone), iterator));
  });
  return result;

  function applyRecursive(item, iterator) {
    if (! Array.isArray(item.children) || item.children.length === 0) return item;
    const result = [];
    item.children.forEach(child => {
      const clone = _.clone(child);
      result.push(applyRecursive(iterator(clone), iterator));
    });
    item.children = result;
    return item;
  }
};

/**
 * Display in the console
 * @param {<Streams>} array 
 * @param {Array} properties to display ['id', ..]
 * @param {*} depth  - private
 */
exports.debug = function debug(streams, properties, depth) {
  const myddepth = depth ? (depth + 1) : 1;
  if (! properties) properties = [];
  const base = '-'.padStart(myddepth * 2, ' ');
  for (let stream of streams) { 
    let line = base + stream.id;
    for (let p of properties) {
      line += ' | ' + p + ': ' + stream[p];
    }
    console.log(line);
    if (stream.children) {
      debug(stream.children, properties, myddepth);
    }
  }
}
