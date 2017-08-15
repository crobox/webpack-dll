var config = require(`../configs/${process.env.WEBPACK_DLL_ENV}.json`);
var path = require('path');
var queue = {};
var utils = require('./utils');
var request = require('request');
var errors = require('./errors');
var database = require('./database');

var packagerUpdateListeners = [];
var packagers = config.packagerServiceUrls.map(function (packageServiceUrl) {
  return {
    url: packageServiceUrl,
    isAvailable: true,
    lastUsed: Date.now(),
    resolvedCount: 0,
    errorCount: 0,
    isBusyCount: 0,
    timeoutCount: 0
  }
});

function emitPackagersUpdate () {
  packagerUpdateListeners.forEach(function (cb) {
    cb();
  });
}

module.exports = {
  listenToPackageUpdates: function (cb) {
    packagerUpdateListeners.push(cb);
  },
  getPackagers: function () {
    return packagers;
  },
  updatePackagersWithStats: function (stats) {
    packagers.forEach(function (packager) {
      var packagerName = utils.getPackagerName(packager)
      if (!stats[packagerName]) {
        return;
      }
      packager.lastUsed = stats[packagerName].lastUsed;
      packager.resolvedCount = stats[packagerName].resolvedCount || 0;
      packager.errorCount = stats[packagerName].errorCount || 0;
      packager.isBusyCount = stats[packagerName].isBusyCount || 0;
      packager.timeoutCount = stats[packagerName].timeoutCount || 0;
    });
  },
  add: function (id, packages, res) {
    if (!queue[id]) {
      queue[id] = [];
    }
    queue[id].push(res);
    if (queue[id].length == 1)  {
      this.getBundle(id, packages)
    }
  },
  getBundle (vendorsBundleName, packages) {
    var requestQueue = this;

    var availablePackager = packagers.sort(function (packagerA, packagerB) {
      if (packagerA.lastUsed > packagerB.lastUsed) {
        return 1;
      } else if (packagerB.lastUsed < packagerB.lastUsed) {
        return -1;
      }

      return 0;
    }).reduce(function (currentPackager, packager) {
      if (currentPackager) {
        return currentPackager;
      }

      if (packager.isAvailable) {
        return packager;
      }

      return currentPackager;
    }, null);

    if (!availablePackager) {
      queue[vendorsBundleName] = [];
      throw new Error(errors.PACKAGER_NOT_AVAILABLE);
    }

    availablePackager.lastUsed = Date.now();
    availablePackager.isAvailable = false;
    emitPackagersUpdate();

    var stream = request({
      url: availablePackager.url + '/' + packages,
      encoding: null,
      gzip: false,
      timeout: config.packageServiceTimeout
    },  function (err, response, body) {
        if (response && response.statusCode === 503) {
          console.log('PACKAGER 503 ERROR - ' + (err ? err.message : body));
          availablePackager.isAvailable = false;
          availablePackager.timeoutCount++;
          requestQueue.reject(vendorsBundleName, new Error(body));
          setTimeout(function () {
            availablePackager.isAvailable = true;
          }, 60000);
        } else if (err || (response && response.statusCode !== 200)) {
          console.log('PACKAGER ERROR - ' + (err ? err.message : body));
          if (body === 'INVALID_VERSION' || body === 'Not Found') {
            availablePackager.isAvailable = true;
            requestQueue.reject(vendorsBundleName, new Error(body));
          } else {
            availablePackager.isAvailable = false;
            setTimeout(function () {
              availablePackager.isAvailable = true;
            }, 10000);
            requestQueue.getBundle(vendorBundleName, packages);
          }
          availablePackager.errorCount++;
          emitPackagersUpdate();
        } else {
          availablePackager.isAvailable = true;
          availablePackager.resolvedCount++;
          emitPackagersUpdate();
        }
      });
      database.saveFile(vendorsBundleName, stream).then(() => {
        requestQueue.resolve(vendorsBundleName);
      }, (err) => {
        console.log('ERROR - Could not write to Database', err);
        requestQueue.reject(vendorsBundleName, err);
      });
  },
  has: function (id) {
    return Boolean(queue[id]);
  },
  remove: function (id) {
    delete queue[id];
  },
  resolve(id) {
    console.log('# RESOLVING FILES - ', id);
    var requests = queue[id];
    requests.forEach(response => database.getFile(id, response));
    queue[id] = [];
  },
  reject(id, err) {
    var requests = queue[id];
    console.error(err);
    requests.forEach(function (request) {
      try {
        request.send(500, err.message);
      } catch (e) {}
    })
    delete queue[id];
  }
}
