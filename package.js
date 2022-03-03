Package.describe({
  name: 'majus:files-gridfs',
  version: '0.0.1',
  summary: 'Meteor-Files API extended to work with MongoDB GridFS',
  git: 'https://github.com/majus/meteor-files-gridfs',
  documentation: 'README.md',
});

const npmDeps = {
  'abort-controller': '3.0.0',
};

Package.onUse(function (api) {
  Npm.depends(npmDeps);
  api.versionsFrom('2.2');
  api.use([
    'ecmascript',
    'underscore',
    'check',
    'random',
    'fetch',
    'mongo',
    'ostrio:files@2.0.1',
  ]);
  api.mainModule('client/index.js', 'client');
  api.mainModule('server/index.js', 'server');
});

Package.onTest(function (api) {
  Npm.depends({
    'sinon': '13.0.1',
    'chai': '4.3.6',
    'sinon-chai': '3.7.0',
    'lodash': '4.17.21',
    ...npmDeps,
  });
  api.use([
    'ecmascript',
    'meteortesting:mocha@2.0.3',
    'hwillson:stub-collections@1.0.9',
  ]);
  api.use('majus:files-gridfs');
  api.addFiles([
    'server/collection.test.js',
  ], 'server');
});
