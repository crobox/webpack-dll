const config = require(`../configs/${process.env.WEBPACK_DLL_ENV}.json`);
const RegistryClient = require('npm-registry-client');

function noop () {}
const silentLog = {
  error: noop, warn: noop, info: noop, verbose: noop,
  silly: noop, http: noop, pause: noop, resume: noop
};

const client = new RegistryClient({log: silentLog});

module.exports = function queryPackage(req, res) {
  var nameSplit = req.params.packageName.split('@');

  // If leading @
  if (!nameSplit[0]) {
    nameSplit.shift();
    nameSplit[0] = '@' + encodeURIComponent(nameSplit[0]);
  }

  var name = nameSplit[0];
  var version = nameSplit[1];

  new Promise(function (resolve, reject) {

    client.request(config.npmRegistryUrl + name, {auth: config.npmRegistryAuth}, function(err, response, body) {
      if (err) {
        return res.sendStatus(err.statusCode || 500);
      }

      try {
        var package = JSON.parse(body);
      } catch (e) {
        return reject(e);
      }

      resolve(package);
    });
  }).then(function (package) {
      var packageVersion

      if (version) {
        if (package['dist-tags'][version]) {
          packageVersion = package['dist-tags'][version]
        } else if (package.versions[version]) {
          packageVersion = version
        } else {
          throw new Error('Version not valid')
        }
      } else {
        packageVersion = package['dist-tags'].latest
      }

      res.send({
        name: package.name,
        version: packageVersion,
        license: package.license,
        description: package.description,
        keywords: package.keywords
      });
  }).catch(function (err) {
    console.error(err);
    res.sendStatus(500);
  });
}
