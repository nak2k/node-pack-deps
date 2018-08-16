const { readFile, createWriteStream, unlink, writeFile } = require('fs');
const JSZip = require('jszip');
const { depsThumbprint } = require('./depsThumbprint');
const path = require('path');
const mkdirp = require('mkdirp');
const npm = require('current-npm');
const waterfall = require('run-waterfall');
const { spawn } = require('child_process');
const { zipFiles } = require('jszip-glob');
const debug = require('debug')('pack-deps');

/**
 * Pack dependencies.
 */
function packDeps(options, callback) {
  const {
    pkgJson,
    pkgDir,
    production,
    cacheBaseDir,
    compression = 'DEFLATE',
    compressionOptions = {
      level: 6,
    },
    exclude,
  } = options;

  const {
    resolvedPkgJson,
    thumbprint,
  } = depsThumbprint({
    pkgJson,
    pkgDir,
    production,
  });

  const oldDir = process.cwd();

  const cacheDir = path.join(cacheBaseDir, thumbprint);
  const cacheFile = path.join(cacheDir, thumbprint + '.zip');
  const contextFile = path.join(cacheDir, 'context.json');

  const context = readContextFile(contextFile);

  debug('cache dir: %s', cacheDir);
  debug('previous context: %O', context);

  waterfall([
    /*
     * Prepare.
     */
    callback =>
      mkdirp(cacheDir, err => {
        if (err) {
          return callback(err);
        }

        process.chdir(cacheDir);

        npm.load((err, npm) => callback(err));
      }),

    /*
     * Pack local packages.
     */
    packLocalPackages.bind(null, resolvedPkgJson.bundledDependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.dependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.devDependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.optionalDependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.peerDependencies, context),

    /*
     * Find a cache.
     */
    next => {
      if (context.cacheInvalidated) {
        debug('Cache is invalidated');

        return next(null);
      }

      readCache(cacheFile, (err, zip) => {
        if (err) {
          return next(err);
        }

        if (!zip) {
          debug('Cache not found');

          return next(null);
        }

        process.chdir(cacheDir);

        debug('Cache found');

        return callback(null, {
          cacheDir,
          cacheFile,
          thumbprint,
          zip,
        });
      });
    },

    /*
     * Write the package.json.
     */
    callback =>
      writeFile(path.join(cacheDir, 'package.json'),
        JSON.stringify(
          Object.assign({
            name: thumbprint,
            private: true,
          }, resolvedPkgJson),
          null, 2),
        callback),

    /*
     * Install deps.
     */
    callback =>
      spawn('npm',
        production ? ['i', '--no-package-lock', '--production'] : ['i', '--no-package-lock'],
        {
          cwd: cacheDir,
          stdio: 'inherit',
          shell: true,
        })
        .on('exit', (code, signal) => {
          if (code === 0) {
            callback(null);
          } else {
            callback(new Error(`npm exited with code ${code}`));
          }
        }),

    /*
     * Pack deps into a zip file.
     */
    zipFiles.bind(null, 'node_modules/**', {
      cwd: cacheDir,
      dot: true,
      nodir: true,
      nosort: true,
      ignore: exclude,
      zip: new JSZip(),
      compression,
      compressionOptions,
    }),

    /*
     * Write a cache.
     */
    (zip, callback) => {
      zip.generateNodeStream({ streamFiles: true })
        .pipe(createWriteStream(cacheFile));

      /*
       * Write the context.
       */
      delete context.cacheInvalidated;

      writeFile(contextFile, JSON.stringify(context, null, 2), err => {
        if (err) {
          return callback(err);
        }

        /*
         * Return a JSZip instance.
         */
        callback(null, zip);
      });
    },
  ], (err, zip) => {
    process.chdir(oldDir);

    if (err) {
      return callback(err);
    }

    callback(null, {
      cacheDir,
      cacheFile,
      thumbprint,
      zip,
    });
  });
}

function readContextFile(contextFile) {
  try {
    return require(contextFile);
  } catch (err) {
    return {
      localPackages: {
      },
    };
  }
}

function packLocalPackages(deps, context, callback) {
  if (!deps) {
    return callback(null);
  }

  const data = Object.entries(deps)
    .reduce((deps, [k, v]) => {
      if (v.startsWith('file:')) {
        deps.keys.push(k);
        deps.values.push(v.substr(5));
      }

      return deps;
    }, { keys: [], values: [] });

  npm.commands.pack(data.values, false, (err, tarballs) => {
    if (err) {
      return callback(err);
    }

    data.keys.forEach((pkgName, index) => {
      const tarball = tarballs[index];

      deps[pkgName] = `file:./${tarball.filename}`;

      const prev = context.localPackages[pkgName];

      if (!prev || prev.integrity !== tarball.integrity.toString()) {
        context.cacheInvalidated = true;
        context.localPackages[pkgName] = {
          integrity: tarball.integrity.toString(),
        };
      }
    });

    callback(null);
  });
}

/*
 * Find a cache.
 */
function readCache(cacheFile, callback) {
  readFile(cacheFile, (err, data) => {
    /*
     * Return the found cache.
     */
    if (!err) {
      return JSZip.loadAsync(data)
        .then(zip => callback(null, zip))
        .catch(err => callback(err, null));
    }

    /*
     * Return an error when not a cache exists.
     */
    if (err.code !== 'ENOENT') {
      return callback(err, null);
    }

    /*
     * Not found.
     */
    callback(null, null);
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
 * Exports.
 */
exports.packDeps = packDeps;
