/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// File built manually by copying indexes (that will change during migration)
// from different collections specifications in storage/src/user
module.exports = {
  indexes: {
    events: [
      {
        index: {time: 1},
        options: {}
      },
      {
        index: {streamId: 1},
        options: {}
      },
      {
        index: {tags: 1},
        options: {}
      },
      // no index by content until we have more actual usage feedback
      {
        index: {trashed: 1},
        options: {}
      },
      {
        index: {modified: 1},
        options: {}
      }
    ]
  }
};