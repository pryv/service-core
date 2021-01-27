/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const schema = require('./config-schema').schema;

function schemaToConfig (o) {
  if (typeof o !== 'object') return o;
  if (Array.isArray(o)) return o;
  if (typeof o.default !== 'undefined') return o.default;
  if (typeof o.format !== 'undefined') return null;

  const res = {};
  let addedOne = false;
  for (let key of Object.keys(o)) {
    const v = schemaToConfig(o[key]);
    if (typeof v !== 'undefined' && v !== null) {
      addedOne = true;
      res[key] = v;
    }
  }
  return addedOne ? res : null;
}

module.exports = schemaToConfig(schema);