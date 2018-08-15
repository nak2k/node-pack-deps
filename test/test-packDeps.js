const test = require('tape');
const { packDeps } = require('..');

test('test packDeps', t => {
  t.plan(6);

  const options = {
    pkgJson: {
      dependencies: {
        mkdirp: '> 0.4',
        'local-package': 'file:./local-package',
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
    t.equal(zip.file('node_modules/local-package/README.md').name, 'node_modules/local-package/README.md');
  });
});
