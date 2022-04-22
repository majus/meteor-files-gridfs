/* eslint-disable no-underscore-dangle */
import { Meteor } from 'meteor/meteor';
import { Mongo, MongoInternals } from 'meteor/mongo';
import { expect, sinon, delay } from 'meteor/majus:testing';
import { merge } from 'lodash';
import { v2 as StreamTest } from 'streamtest';
import { GridFilesCollectionServer } from './collection';

function fakeInputStream() {
  return {
    on: sinon.fake(),
  };
}

function fakeOutputStream() {
  return {
    write: sinon.stub(),
    end: sinon.stub(),
  };
}

function fakeHttp(stream = fakeOutputStream()) {
  const response = Object.create(stream);
  Object.assign(response, {
    setHeader: sinon.stub(),
  });
  return {
    response,
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

function fakeGridBucket({
  input = fakeInputStream(),
  output = fakeOutputStream(),
} = {}) {
  return {
    openDownloadStream: sinon.stub().returns(input),
    openUploadStream: sinon.stub().returns(output),
    find: sinon.stub(),
    delete: sinon.stub(),
  };
}

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

    it('writes GridFS file contents to the HTTP response', (done) => {
      const input = StreamTest.fromChunks(['aaa']);
      const output = StreamTest.toText((err, result) => {
        try {
          expect(err).to.be.null;
          expect(result).to.be.equal('aaa');
          done();
        } catch (err) {
          done(err);
        }
      });
      const http = fakeHttp(output);
      const file = fakeFile();
      const bucket = fakeGridBucket({ input });
      const files = fakeFilesCollection();
      sinon.stub(files, 'gridBucket').value(bucket);
      files.download(http, 'original', file);
    });

  });

  describe('#write', () => {

    it('writes buffer contents to GridFS', (done) => {
      const buffer = Buffer.from('abc');
      const output = StreamTest.toText((err, result) => {
        try {
          expect(err).to.be.null;
          expect(result).to.be.equal('abc');
          done();
        } catch (err) {
          done(err);
        }
      });
      const bucket = fakeGridBucket({ output });
      const files = fakeFilesCollection();
      sinon.stub(files, 'gridBucket').value(bucket);
      files.write(buffer);
    });

    it('inserts file object into collection', (done) => {
      const buffer = Buffer.alloc(0);
      const output = fakeOutputStream();
      const bucket = fakeGridBucket({ output });
      const files = fakeFilesCollection();
      sinon.spy(files.collection, 'insert');
      sinon.stub(files, 'gridBucket').value(bucket);
      output.end = sinon.stub().yields();
      files.write(buffer, {
        meta: { country: 'Albania' },
        type: 'text/fake',
        size: 10000,
        userId: '12345678',
      }, (err, file) => {
        try {
          expect(err).to.be.null;
          expect(files.collection.insert).to.be.calledOnce;
          expect(file).to.be.an('object').and.deep.include({
            meta: { country: 'Albania' },
            type: 'text/fake',
            size: 10000,
            userId: '12345678',
          });
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it('calls onAfterUpload if implicitly requested', (done) => {
      const buffer = Buffer.alloc(0);
      const output = fakeOutputStream();
      const bucket = fakeGridBucket({ output });
      const onAfterUpload = sinon.stub();
      const files = fakeFilesCollection({ onAfterUpload });
      sinon.stub(files, 'gridBucket').value(bucket);
      output.end = sinon.stub().yields();
      files.write(buffer, {}, (err, file) => {
        try {
          expect(err).to.be.null;
          expect(files.onAfterUpload).not.to.be.called;
          Meteor.defer(() => {
            try {
              expect(files.onAfterUpload).to.be.calledOnce
                .and.to.be.calledWith(file);
              expect(files.onAfterUpload.firstCall.thisValue).to.be.equal(files);
              done();
            } catch (err) {
              done(err);
            }
          });
        } catch (err) {
          done(err);
        }
      }, true);
    });

    it('gives error in case of problem with output stream', (done) => {
      const buffer = Buffer.alloc(0);
      const error = new Error('Streaming error');
      const output = fakeOutputStream();
      const bucket = fakeGridBucket({ output });
      const onAfterUpload = sinon.stub();
      const files = fakeFilesCollection({ onAfterUpload });
      output.end.yields(error);
      sinon.spy(files.collection, 'insert');
      sinon.stub(files, 'gridBucket').value(bucket);
      files.write(buffer, {}, (err) => {
        try {
          expect(err).to.be.equal(error);
          expect(files.collection.insert).not.to.be.called;
          expect(onAfterUpload).to.not.be.called;
          done();
        } catch (err) {
          done(err);
        }
      }, true);
    });

    it('gives error in case of problems with database access', (done) => {
      const buffer = Buffer.alloc(0);
      const error = new Error('Database error');
      const output = fakeOutputStream();
      const bucket = fakeGridBucket({ output });
      const onAfterUpload = sinon.stub();
      const files = fakeFilesCollection({ onAfterUpload });
      sinon.stub(files.collection, 'insert').yields(error);
      sinon.stub(files, 'gridBucket').value(bucket);
      output.end = sinon.stub().yields();
      files.write(buffer, {}, (err) => {
        try {
          expect(err).to.be.equal(error);
          expect(onAfterUpload).to.not.be.called;
          done();
        } catch (err) {
          done(err);
        }
      }, true);
    });

  });

  describe('#load', () => {

    it('downloads the file and stores to GridFS', (done) => {
      const input = StreamTest.fromChunks(['aaa']);
      const outputener = sinon.stub();
      const output = StreamTest.toText(outputener);
      const url = 'https://example.com/fake.png';
      const bucket = fakeGridBucket({ output });
      const files = fakeFilesCollection();
      const gridFileId = new MongoInternals.NpmModule.ObjectId('143786772699256736964736');
      const gridFile = {
        _id: gridFileId,
        contentType: 'text/fake',
        length: 12345,
      };
      const response = {
        status: 200,
        headers: new Map(),
        body: input,
      };
      output.id = gridFileId;
      bucket.find.withArgs({ _id: gridFileId }).returns({
        next: sinon.stub().yields(null, gridFile),
      });
      sinon.stub(files, 'gridBucket').value(bucket);
      sinon.stub(files, 'fetch').resolves(response);
      files.load(url, {}, (err, file) => {
        try {
          expect(outputener).to.be.calledOnce;
          expect(outputener).to.be.calledWith(null, 'aaa');
          expect(file).to.deep.include({
            type: 'text/fake',
            mime: 'text/fake',
            size: 12345,
          });
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it('gives error on non-200 HTTP response', (done) => {
      const url = 'https://example.com/fake.png';
      const files = fakeFilesCollection();
      const response = {
        status: 500,
        statusText: 'fake problem',
      };
      sinon.stub(files, 'gridBucket');
      sinon.stub(files, 'fetch').resolves(response);
      files.load(url, {}, (err) => {
        try {
          expect(files.fetch).to.be.calledOnce
            .and.to.be.calledWith(url);
          expect(err).to.be.instanceOf(Meteor.Error);
          expect(err.message).to.include('fake problem');
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it('gives error on timeout', (done) => {
      const url = 'https://example.com/fake.png';
      const files = fakeFilesCollection();
      const clock = sinon.useFakeTimers();
      const response = {};
      sinon.stub(files, 'gridBucket');
      sinon.stub(files, 'fetch').returns(delay(500000).then(() => response));
      files.load(url, {}, (err) => {
        try {
          expect(err).to.be.instanceOf(Meteor.Error);
          expect(err.message).to.include('Request timeout');
          done();
        } catch (err) {
          done(err);
        }
      });
      clock.tick(500000);
    });

  });

  describe('#unlink', () => {

    //TODO

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
