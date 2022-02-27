import { Meteor } from 'meteor/meteor';

export class GridWriteStream {

  constructor(bucket, path, opts) {
    this.file = opts;
    this.aborted = false;
    this.ended = false;
    this.stream = bucket.openUploadStream(opts.file.name, {
      contentType: opts.file.type || 'binary/octet-stream',
    });
  }

  end(callback) {
    if (!this.aborted && !this.ended) {
      this.stream.end(Buffer.from([]), null, Meteor.bindEnvironment((err) => {
        this.ended = true;
        if (callback) {
          if (err) {
            callback(err);
          } else {
            callback(null, true);
          }
        }
      }));
      return true;
    } else if (callback) {
      callback(null, this.ended);
    }
    return false;
  }

  write(num, chunk, callback) {
    if (!this.aborted && !this.ended) {
      this.stream.write(chunk, 'base64', Meteor.bindEnvironment((err) => {
        if (err) {
          this.abort();
        }
        if (callback) {
          callback(err);
        }
      }));
    }
    return false;
  }

  abort(cb) {
    if (!this.aborted && !this.ended) {
      this.aborted = true;
      this.stream.abort(cb);
      return true;
    }
    return false;
  }

  stop(cb) {
    return this.abort(cb);
  }

}
