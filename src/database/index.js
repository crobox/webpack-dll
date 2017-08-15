var config = require(`../../configs/${process.env.WEBPACK_DLL_ENV}.json`);
var db = require('./mongodb.js');
var mime = require('mime');
var path = require('path');

module.exports = {
  connect: db.connect,
  saveFile: function (fileName, stream) {
    return db.writeFile(fileName, stream);
  },
  getFile: function (fileName, res) {
    res.set({
      'Content-Type': mime.lookup(fileName),
      'Cache-Control': 'public, max-age=' + config.cacheMaxAge
    })
    return db.readFile(fileName, res);
  },
  fileExists: function (fileName) {
    return db.fileExists(fileName);
  },
  getStats: function () {
    return db.find('stats');
  },
  updateStats: function (stats) {
    return db.update('stats', {
      name: 'total'
    }, {
      name: 'total',
      stats: stats
    });
  }
}
