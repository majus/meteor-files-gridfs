/* eslint-disable no-underscore-dangle */
import { Meteor } from 'meteor/meteor';
import { Mongo, MongoInternals } from 'meteor/mongo';
import { merge } from 'lodash';
import chai, { expect } from 'chai';
import sinon from 'sinon';
import { GridFilesCollectionServer } from './collection';

chai.use(require('sinon-chai'));

describe('GridFilesCollectionServer class', () => {

  beforeEach(() => {
    sinon.stub(Meteor, 'methods');
  });

  afterEach(() => {
    sinon.restore();
  });

  function fakeFilesCollection(options) {
    return new GridFilesCollectionServer({
      collection: new Mongo.Collection('tiles', {
        defineMutationMethods: false,
      }),
      _preCollection: new Mongo.Collection('pre.tiles', {
        defineMutationMethods: false,
      }),
      ...options,
    });
  }

  describe('#download', () => {

    function fakeHttp() {
      return {
        response: {
          setHeader: sinon.fake(),
          write: sinon.fake(),
          end: sinon.fake(),
        },
        params: {},
      };
    }

    function fakeFile(data) {
      return merge({
        versions: {
          original: {
            gridFileId: '787867726964667369647878',
          },
        },
      }, data);
    }

    function fakeGridBucket() {
      return {
        openDownloadStream: sinon.fake.returns({
          on: sinon.fake(),
        }),
      };
    }

    it('returns error 404 if `gridFileId` is missing', () => {
      const files = fakeFilesCollection();
      const http = fakeHttp();
      const file = fakeFile({
        versions: {
          original: {
            gridFileId: null,
          },
        },
      });
      sinon.stub(files, '_debug');
      sinon.stub(files, '_404');
      files.download(http, 'original', file);
      expect(files._debug).to.be.calledOnce;
      expect(files._404).to.be.calledOnce;
    });

    //TODO: Actual HTTP response writing tests...

    // it('writes GridFS file contents to the HTTP response', () => {
    //   const files = fakeFilesCollection();
    //   const http = fakeHttp();
    //   const file = fakeFile();
    //   sinon.stub(files, 'gridBucket').value(fakeGridBucket());
    //   files.download(http, 'original', file);
    // });

  });

  describe('#write', () => {
  });

  describe('#load', () => {
  });

  describe('#unlink', () => {
  });

  describe('#_createStream', () => {

    it('creates an instance of GridWriteStream class', () => {
      const FakeGridWriteStream = sinon.fake();
      sinon.stub(GridFilesCollectionServer, 'GridWriteStream').get(() => FakeGridWriteStream);
      const files = fakeFilesCollection();
      const opts = { file: { name: 'fake.png' } };
      files._createStream('test', '/tmp/fake.png', opts);
      expect(FakeGridWriteStream).to.be.calledWith(
        sinon.match.instanceOf(MongoInternals.NpmModule.GridFSBucket),
        '/tmp/fake.png',
        opts,
      );
      expect(files._currentUploads['test']).to.be.instanceOf(FakeGridWriteStream);
    });

  });

  describe('#_dataToSchema', () => {

    it('returned object does not contain path fields', () => {
      const files = fakeFilesCollection();
      const result = files._dataToSchema({
        //???
      });
      expect(result).to.not.have.nested.keys('_storagePath', 'path', 'versions.original.path');
    });

    it('substitutes `gridFileId`', () => {
      const files = fakeFilesCollection();
      sinon.stub(files, '_currentUploads').value({
        'test': {
          stream: {
            id: new MongoInternals.NpmModule.ObjectId('787867726964667369647878'),
          },
        },
      });
      const result = files._dataToSchema({
        _id: 'test',
      });
      expect(result).to.nested.include({
        'versions.original.gridFileId': '787867726964667369647878',
      });
    });

  });

});
