

module.exports.add = function (username, event, callback) {
  callback(null, 'salut, changez moi' + JSON.stringify(event).length);
};