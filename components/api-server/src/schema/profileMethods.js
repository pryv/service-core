/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of methods data for profile settings.
 */

var helpers = require('./helpers'),
    object = helpers.object,
    string = helpers.string;

var profileData = object({ /* no constraints */ });

module.exports = {

  get: {
    params: object({
      // in path for HTTP requests
      'id': string()
    }, {
      required: [ 'id' ]
    }),
    result: object({
      'profile': profileData
    })
  },

  update: {
    params: object({
      // in path for HTTP requests
      'id': string(),
      // = body of HTTP requests
      'update': profileData
    }, {
      required: [ 'id', 'update' ]
    }),
    result: object({
      'profile': profileData
    }, {
      required: [ 'profile' ]
    })
  }

};
