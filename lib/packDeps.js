const { readFile, stat, createWriteStream } = require('fs');
const JSZip = require('jszip');
const { depsThumbprint } = require('./depsThumbprint');
const path = require('path');
const mkdirp = require('mkdirp');
const npm = require('npm');
const glob = require('glob');
const parallel = require('run-parallel');

/**
 * Pack dependencies.
 */
function packDeps(options, callback) {
  const {
    pkgJson,
    pkgDir,
    production,
    cacheBaseDir,
  } = options;

  const thumbprint = depsThumbprint({
    pkgJson,
    pkgDir,
    production,
  });

  const cacheDir = path.join(cacheBaseDir, thumbprint);
  const cacheFile = path.join(cacheDir, thumbprint + '.zip');

  /*
   * Find a cache.
   */
  readFile(cacheFile, (err, data) => {
    /*
     * Return the found cache.
     */
    if (!err) {
      JSZip.loadAsync(data)
        .then(zip => callback(null, {
          cacheDir,
          cacheFile,
          zip,
        }))
        .catch(err => callback(err, null));
      return;
    }

    /*
     * Return an error when not a cache exists.
     */
    if (err.code !== 'ENOENT') {
      return callback(err, null);
    }

    /*
     * Install deps.
     */
    installDeps(cacheDir, options, err => {
      if (err) {
        return callback(err);
      }

      /*
       * Pack deps into a zip file.
       */
      packDepsIntoZip(cacheDir, (err, zip) => {
        if (err) {
          return callback(err);
        }

        /*
         * Write a cache.
         */
        zip.generateNodeStream({ streamFiles: true })
          .pipe(createWriteStream(cacheFile));

        /*
         * Return a JSZip instance.
         */
        callback(null, {
          cacheDir,
          cacheFile,
          zip,
        });
      });
    });
  });
}

/*
 * Install dependencies. 
 */
function installDeps(cacheDir, options, callback) {
  const {
    pkgJson,
    pkgDir,
    production,
  } = options;

  /*
   * Prepare the cache dir.
   */
  mkdirp(cacheDir, (err, made) => {
    if (err) {
      return callback(err);
    }

    /*
     * Load npm data.
     */
    npm.load((err, npm) => {
      if (err) {
        return callback(err);
      }

      /*
       * Set options.
       */
      npm.config.set('production', production);
      npm.config.set('save', false);
      npm.config.set('package-lock', false);

      /*
       * Install deps.
       */
      const args = [
        ...makeInstallArgs(pkgJson.bundledDependencies, pkgDir),
        ...makeInstallArgs(pkgJson.dependencies, pkgDir),
        ...(production ? [] : makeInstallArgs(pkgJson.devDependencies, pkgDir)),
        ...makeInstallArgs(pkgJson.optionalDependencies, pkgDir),
        ...makeInstallArgs(pkgJson.peerDependencies, pkgDir),
      ];
      npm.commands.install(cacheDir, args, err => {
        if (err) {
          return callback(err);
        }

        callback(null);
      });
    });
  });
}

/*
 * Make arguments to run `npm install`.
 */
function makeInstallArgs(deps, base) {
  if (deps === undefined) {
    return [];
  }

  return Object.entries(deps).map(
    ([name, ver]) => ver.startsWith('file:')
      ? 'file:' + path.resolve(base, ver.substr(5))
      : `${name}@${ver}`
  );
}

/*
 * Pack deps into a zip file.
 */
function packDepsIntoZip(cacheDir, callback) {
  glob('node_modules/**', {
    cwd: cacheDir,
    dot: true,
    nodir: true,
    nosort: true,
  }, (err, files) => {
    if (err) {
      return callback(err);
    }

    const zip = new JSZip();

    const tasks = files.map(f =>
      addFileIntoZip.bind(null, f, cacheDir, zip));

    parallel(tasks, (err, result) => {
      if (err) {
        return callback(err);
      }

      callback(null, zip);
    });
  });
}

function addFileIntoZip(file, base, zip, callback) {
  stat(path.join(base, file), (err, stats) => {
    if (err) {
      return callback(err);
    }

    readFile(path.join(base, file), (err, data) => {
      if (err) {
        return callback(err);
      }

      zip.file(file, data, {
        mode: stats.mode,
        date: new Date(stats.mtime),
      });

      callback(null);
    });
  });
}

/*
 * Exports.
 */
exports.packDeps = packDeps;
