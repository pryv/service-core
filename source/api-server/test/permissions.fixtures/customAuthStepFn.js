module.exports = function (context, callback) {
  if (context.callerId === 'Please Crash') {
    throw new Error('Crashing as politely asked.');
  }
  else if (context.callerId !== 'Georges (unparsed)') {
    return callback(new Error('Sorry, only Georges can use the API.'));
  }
  context.callerId = 'Georges (parsed)';
  callback();
};
