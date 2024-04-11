/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Test helper functions for attached files.
 */
const fs = require('fs');
const path = require('path');
const testData = require('./data');
const { getMall } = require('mall');
// Returns an empty string if the tested file attached to the specified event
// is identical to the original file. (Runs command-line util `cmp`
// underneath).
//
exports.compareTestAndAttachedFiles = async function (user, eventId, fileId, originalFileName) {
  if (originalFileName == null) {
    originalFileName = fileId;
  }
  const mall = await getMall();
  const attachmentStream = await mall.events.getAttachment(user.id, { id: eventId }, fileId);
  const sourceStream = fs.createReadStream(path.join(testData.testsAttachmentsDirPath, originalFileName));
  const attachmentBuffer = await streamToBuffer(attachmentStream);
  const sourceBuffer = await streamToBuffer(sourceStream);

  return Buffer.compare(attachmentBuffer, sourceBuffer) === 0;
};

async function streamToBuffer (readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', data => {
      chunks.push(data);
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}
