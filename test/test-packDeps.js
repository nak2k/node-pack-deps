const test = require('tape');
const { packDeps } = require('..');

test('test packDeps', t => {
  t.plan(5);

  const options = {
    pkgJson: {
      dependencies: {
        mkdirp: '> 0.4',
      },
    },
    pkgDir: __dirname,
    production: true,
    cacheBaseDir: __dirname + '/tmp',
  };

  packDeps(options, (err, result) => {
    t.error(err);

    t.equal(typeof(result.cacheDir), 'string');
    t.equal(typeof(result.cacheFile), 'string');

    const { zip } = result;

    t.equal(typeof(zip), 'object');
    t.equal(zip.file('node_modules/mkdirp/readme.markdown').name, 'node_modules/mkdirp/readme.markdown');
  });
});
