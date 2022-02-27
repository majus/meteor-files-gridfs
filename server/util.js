import { MongoInternals } from 'meteor/mongo';

export function getContentDisposition(name, downloadFlag) {
  // Will initiate download, if links are called with ?download="true" queryparam.
  const dispositionType = downloadFlag === 'true' ? 'attachment;' : 'inline;';
  const encodedName = encodeURIComponent(name);
  const dispositionName = `filename="${encodedName}"; filename=*UTF-8"${encodedName}";`;
  const dispositionEncoding = 'charset=utf-8';
  return `${dispositionType} ${dispositionName} ${dispositionEncoding}`;
}

export function createObjectId(id) {
  return new MongoInternals.NpmModule.ObjectID(id);
}

export function createGridBucket(bucketName) {
  const { mongo: { db } } = MongoInternals.defaultRemoteCollectionDriver();
  return new MongoInternals.NpmModule.GridFSBucket(db, { bucketName });
}
