var utils = require('./utils');
var path = require('path');
var requestQueue = require('./requestQueue');
var database = require('./database');

module.exports = function extractAndBundle () {
  return function (req, res) {
    var vendorsBundleName = utils.getVendorsBundleName(req.params.packages);
    requestQueue.add(vendorsBundleName, req.params.packages, res);
  }
}
