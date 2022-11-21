/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = function (context, callback) {
  if (context.headers.callerid) { // used for "header tests"
    context.callerId = context.headers.callerid;
  }

  if (context.callerId === 'Please Crash') {
    throw new Error('Crashing as politely asked.');
  } else if (context.callerId !== 'Georges (unparsed)') {
    return callback(new Error('Sorry, only Georges can use the API.'));
  }

  context.callerId = 'Georges (parsed)';
  callback();
};
