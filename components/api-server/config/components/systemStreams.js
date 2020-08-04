/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'

let config =
{
  systemStreams: {
    profile: {
      username: {
        isIndexed: true,
        isShown: true,
        type: "string/pryv",
        sendToRegister: ""
      },
      email: {
        "isIndexed": true,
        "isShown": true,
        "type": "string/pryv"
      },
      language: {
        isIndexed: true,
        isShown: true,
        type: "string/pryv",
        default: "en"
      },
      appId: {
        isIndexed: true,
        isShown: false,
        type: "string/pryv"
      },
      invitationToken: {
        isIndexed: true,
        isShown: false,
        type: "string",
        default: "no-token"
      },
      passwordHash: {
        isIndexed: false,
        isShown: false,
        type: "string/pryv"
      },
      referer: {
        isIndexed: true,
        isShown: false,
        type: "string/pryv",
        default: null
      },
      storageUsed: {
        dbDocuments: {
          isIndexed: true,
          isShown: true,
          type: "integer/pryv",
          default: 0,
          displayName: 'dbDocuments'
        },
        attachedFiles: {
          isIndexed: true,
          isShown: true,
          type: "integer/pryv",
          default: 0
        }
      }
    }
  }
}
   
if (process.env.additionalProfileFields) {
  const jsoncustomAccountFields = JSON.parse(process.env.additionalProfileFields);
  if (jsoncustomAccountFields) {
    const keys = Object.keys(jsoncustomAccountFields);
    let i;
    for (i = 0; i < keys; i++){
      config.systemStreams.profile[keys] = jsoncustomAccountFields[keys];
      // if some properties are not set, set them by default
      //TODO IEVA
    }
  }
}

module.exports = config;