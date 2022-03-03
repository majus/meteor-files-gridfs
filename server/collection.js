/* eslint-disable default-param-last */
/* eslint-disable no-underscore-dangle */
import { Meteor } from 'meteor/meteor';
import { _ } from 'meteor/underscore';
import { check, Match } from 'meteor/check';
import { Random } from 'meteor/random';
import { fetch } from 'meteor/fetch';
import { FilesCollection } from 'meteor/ostrio:files';
import AbortController from 'abort-controller';
import { getContentDisposition, createObjectId, createGridBucket } from './util';

export class GridFilesCollectionServer extends FilesCollection {

  static get GridWriteStream() {
    return require('./stream').GridWriteStream;
  }

  gridBucket = createGridBucket(this.collectionName);

  // Override default behaviour to stream directly to GridFS bypassing file system
  _createStream = function(_id, path, opts) {
    this._currentUploads[_id] = new this.constructor.GridWriteStream(this.gridBucket, path, opts);
  };

  download(http, version = 'original', fileRef) {
    const { gridFileId } = fileRef.versions[version] || {};
    if (gridFileId) {
      // opens the download stream using a given gfs id
      // see: http://mongodb.github.io/node-mongodb-native/3.2/api/GridFSBucket.html#openDownloadStream
      const gfsId = createObjectId(gridFileId);
      this.gridBucket.openDownloadStream(gfsId)
        .on('data', data => http.response.write(data))
        // don't pass parameters to end() or it will be attached to the file's binary stream
        .on('end', () => http.response.end())
        .on('error', (err) => {
          this._debug('[GridFilesCollection] [download] Error:', err);
          this._404(http);
        });
      http.response.setHeader('Cache-Control', this.cacheControl);
      http.response.setHeader(
        'Content-Disposition',
        getContentDisposition(fileRef.name, http?.params?.query?.download),
      );
    } else {
      this._debug('[GridFilesCollection] [download] Error: GridFS file ID is missing');
      this._404(http);
    }
  }

  write(buffer, _opts = {}, _callback, _proceedAfterUpload) {
    this._debug('[FilesCollection] [write()]');
    let opts = _opts;
    let callback = _callback;
    let proceedAfterUpload = _proceedAfterUpload;
    if (_.isFunction(opts)) {
      proceedAfterUpload = callback;
      callback = opts;
      opts = {};
    } else if (_.isBoolean(callback)) {
      proceedAfterUpload = callback;
    } else if (_.isBoolean(opts)) {
      proceedAfterUpload = opts;
    }
    check(opts, Match.Optional(Object));
    check(callback, Match.Optional(Function));
    check(proceedAfterUpload, Match.Optional(Boolean));
    const fileId = opts.fileId || Random.id();
    const autoName = this.namingFunction ? this.namingFunction(opts) : fileId;
    const fileName = (opts.name || opts.fileName) ? (opts.name || opts.fileName) : autoName;
    const { extension } = this._getExt(fileName);
    opts.type = this._getMimeType(opts);
    if (!_.isObject(opts.meta)) {
      opts.meta = {};
    }
    if (!_.isNumber(opts.size)) {
      opts.size = buffer.length;
    }
    const result = this._dataToSchema({
      name: fileName,
      meta: opts.meta,
      type: opts.type,
      size: opts.size,
      userId: opts.userId,
      extension,
    });
    result._id = fileId;
    const stream = this.gridBucket.openUploadStream(fileName, {
      contentType: opts.type || 'binary/octet-stream',
    });
    stream.end(buffer, null, Meteor.bindEnvironment((streamErr) => {
      if (streamErr) {
        if (callback) {
          callback(streamErr);
        }
      } else {
        this.collection.insert(result, (insertErr, _id) => {
          if (insertErr) {
            this._debug(`[FilesCollection] [write] [insert] Error: ${fileName} -> ${this.collectionName}`, insertErr);
            if (callback) {
              callback(insertErr);
            }
          } else {
            const fileRef = this.collection.findOne(_id);
            if (callback) {
              callback(null, fileRef);
            }
            if (proceedAfterUpload === true) {
              if (this.onAfterUpload) {
                this.onAfterUpload.call(this, fileRef);
              }
              this.emit('afterUpload', fileRef);
            }
            this._debug(`[FilesCollection] [write]: ${fileName} -> ${this.collectionName}`);
          }
        });
      }
    }));
    return this;
  }

  load(url, _opts = {}, _callback, _proceedAfterUpload = false) {
    this._debug(`[FilesCollection] [load(${url}, ${JSON.stringify(_opts)}, callback)]`);
    let opts = _opts;
    let callback = _callback;
    let proceedAfterUpload = _proceedAfterUpload;
    if (_.isFunction(opts)) {
      proceedAfterUpload = callback;
      callback = opts;
      opts = {};
    } else if (_.isBoolean(callback)) {
      proceedAfterUpload = callback;
    } else if (_.isBoolean(opts)) {
      proceedAfterUpload = opts;
    }
    check(url, String);
    check(opts, Match.Optional(Object));
    check(callback, Match.Optional(Function));
    check(proceedAfterUpload, Match.Optional(Boolean));
    if (!_.isObject(opts)) {
      opts = {
        timeout: 360000,
      };
    }
    if (!opts.timeout) {
      opts.timeout = 360000;
    }
    const fileId = opts.fileId || Random.id();
    const autoName = this.namingFunction ? this.namingFunction(opts) : fileId;
    const pathParts = url.split('/');
    const fileName = (opts.name || opts.fileName) ? (opts.name || opts.fileName) : pathParts[pathParts.length - 1].split('?')[0] || autoName;
    let isEnded = false;
    const onFinish = Meteor.bindEnvironment((gridFile) => {
      if (!isEnded) {
        this._debug(`[FilesCollection] [load] Received: ${url}`);
        isEnded = true;
        const result = this._dataToSchema({
          fileId,
          userId: opts.userId,
          name: fileName,
          path: opts.path,
          meta: opts.meta,
          extension: this._getExt(fileName).extension,
          type: gridFile.contentType,
          mime: gridFile.contentType,
          size: gridFile.length,
        });
        result.versions.original.gridFileId = gridFile._id.toHexString();
        this.collection.insert(result, (err, _id) => {
          if (err) {
            this._debug(`[FilesCollection] [load] [insert] Error: ${fileName} -> ${this.collectionName}`, err);
            if (callback) {
              callback(err);
            }
          } else {
            const fileRef = this.collection.findOne(_id);
            if (callback) {
              callback(null, fileRef);
            }
            if (proceedAfterUpload === true) {
              if (this.onAfterUpload) {
                this.onAfterUpload.call(this, fileRef);
              }
              this.emit('afterUpload', fileRef);
            }
            this._debug(`[FilesCollection] [load] [insert] ${fileName} -> ${this.collectionName}`);
          }
        });
      }
    });
    const onError = Meteor.bindEnvironment((err) => {
      this._debug(`[FilesCollection] [load] [fetch(${url})] Error:`, err);
      if (!isEnded) {
        this.isEnded = true;
        if (callback) {
          callback(err);
        }
      }
    });
    const onResponse = Meteor.bindEnvironment((response) => {
      if (response.status === 200) {
        const stream = this.gridBucket.openUploadStream(fileName, {
          contentType: response.headers.get('content-type') || 'binary/octet-stream',
        });
        response.body.pipe(stream).on('error', (err) => {
          // Abort GridFS streaming & remove the document
          stream.abort();
          this.gridBucket.delete(stream.id);
          onError(err);
        }).on('finish', () => {
          // Get the resulting file size
          this.gridBucket.find({ _id: stream.id }).next((err, gridFile) => {
            if (err) {
              // Remove GridFS document
              this.gridBucket.delete(stream.id);
              onError(err);
            } else {
              onFinish(gridFile);
            }
          });
        });
      } else {
        const message = response.statusText || 'Bad response with empty details';
        const error = new Meteor.Error(response.status, message);
        this._debug(`[FilesCollection] [load] [fetch(${url})] Error: `, error);
        isEnded = true;
        if (callback) {
          callback(error);
        }
      }
    });
    const controller = new AbortController();
    fetch(url, {
      headers: opts.headers || {},
      signal: controller.signal,
    }).then(onResponse).catch(onError);
    if (opts.timeout > 0) {
      Meteor.setTimeout(() => {
        if (!isEnded) {
          onError(new Meteor.Error(408, `Request timeout after ${opts.timeout}ms`));
          controller.abort();
        }
      }, opts.timeout);
    }
    return this;
  }

  unlink(fileRef, version, callback) {
    if (version) {
      const { gridFileId } = (fileRef.versions[version] || {});
      if (gridFileId) {
        const gfsId = createObjectId(gridFileId);
        this.gridBucket.delete(gfsId, (err) => {
          if (err) this._debug('[GridFilesCollection] [unlink] Error:', err);
          if (callback) {
            callback(err);
          }
        });
      }
    } else if (_.isObject(fileRef.versions)) {
      for (const key of Object.keys(fileRef.versions)) {
        this.unlink(fileRef, key, callback);
      }
    }
    return this;
  }

  _dataToSchema(data) {
    const result = super._dataToSchema(data);
    delete result.path;
    delete result.versions.original.path;
    delete result._storagePath;
    if (this._currentUploads[data._id]) {
      const { id } = this._currentUploads[data._id].stream;
      result.versions.original.gridFileId = id.toHexString();
    }
    return result;
  }

}
