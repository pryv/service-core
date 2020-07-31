'use strict'

let config =
{
  systemStreams: {
    profile: {
      username: {
        isIndexed: true,
        isShown: true,
        type: "string",
        sendToRegister: ""
      },
      email: {
        "isIndexed": true,
        "isShown": true,
        "type": "string"
      },
      language: {
        isIndexed: true,
        isShown: true,
        type: "string",
        default: "en"
      },
      appId: {
        isIndexed: true,
        isShown: false,
        type: "string"
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
        type: "string"
      },
      referer: {
        isIndexed: true,
        isShown: false,
        type: "string",
        default: null
      },
      storageUsed: {
        dbDocs: {
          isIndexed: true,
          isShown: true,
          type: "integer",
          default: 0,
          displayName: 'dbDocuments'
        },
        attachedFiles: {
          isIndexed: true,
          isShown: true,
          type: "integer",
          default: 0
        }
      }
    }
  }
}
   
if (process.env.additionalProfileFields) {
  const jsonAdditionalProfileFIelds = JSON.parse(process.env.additionalProfileFields);
  if (jsonAdditionalProfileFIelds) {
    const keys = Object.keys(jsonAdditionalProfileFIelds);
    let i;
    for (i = 0; i < keys; i++){
      config.systemStreams.profile[keys] = jsonAdditionalProfileFIelds[keys];
      // if some properties are not set, set them by default
      //TODO IEVA
    }
  }
}

module.exports = config;