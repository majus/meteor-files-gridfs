Package.describe({
  name: 'majus:files-gridfs',
  version: '0.0.1',
  summary: 'Meteor-Files API extended to work with MongoDB GridFS',
  git: 'https://github.com/majus/meteor-files-gridfs',
  documentation: 'README.md',
})

Npm.depends({
  'abort-controller': '3.0.0',
})

Package.onUse(function (api) {
  api.versionsFrom('2.2')
  api.use([
    'ecmascript',
    'underscore',
    'check',
    'random',
    'fetch',
    'mongo',
    'ostrio:files@2.0.1',
  ])
  api.mainModule('client/index.js', 'client')
  api.mainModule('server/index.js', 'server')
})

Package.onTest(function (api) {
  api.use('ecmascript')
  api.use('majus:files-gridfs')
  //TODO: api.addFiles(...)
})
