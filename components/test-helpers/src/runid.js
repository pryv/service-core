/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// 4 letters code to happend to all ids to run in parallel
const runId = (Math.random() + 1).toString(36).substring(8);
exports.runId = runId;

/**
 * Transform an array by adding runId to items[property]
 * @param {Array} array
 * @param {string} [property='id'] the property to change (default: 'id')
 * @param {string} [space='-'] spacer between original property value and runId (default '-')
 * @returns array
 */
exports.runIdMap = function runIdMap (array, property = 'id', space = '-') {
  for (const item of array) {
    item[property] += space + runId;
  }
  return array;
};

/**
 * Transform a tree by adding runId to items[property]
 * @param {Array} array
 * @param {string} [property='id'] the property to change (default: 'id')
 * @param {string} [childrenProperty='children'] the property to find children of item (default: 'children')
 * @param {string} [space='-'] spacer between original property value and runId (default '-')
 * @returns array
 */
function runIdTree (array, property = 'id', childrenProperty = 'children', space = '-') {
  for (const item of array) {
    if (item[property] != null) item[property] += space + runId;
    if (item[childrenProperty] != null) runIdTree(item[childrenProperty], property, childrenProperty, space);
  }
  return array;
}
exports.runIdTree = runIdTree;

exports.runIdStreamTree = function runIdStreamTree (array) {
  runIdTree(array);
  runIdTree(array, 'parentId');
  return array;
};
