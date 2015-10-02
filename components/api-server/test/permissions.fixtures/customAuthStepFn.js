module.exports = function (context, callback) {
  if (context.callerId !== 'Georges (unparsed)') {
    return callback('Sorry, only Georges can use the API.');
  }
  context.callerId = 'Georges (parsed)';
  callback();
};
