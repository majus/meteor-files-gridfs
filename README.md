# Overview

This is an extension of the API exported from `ostrio:files` Meteor package which allows to bypass the filesystem and store the uploaded files directly to the GridFS of MongoDB.

# Installing

```
meteor add majus:files-gridfs
```

# Using

```js
import { GridFilesCollection } from 'meteor/majus:files-gridfs';

// Now just use GridFilesCollection in place of FilesCollection from ostrio:files
const Avatars = new GridFilesCollection({
  collectionName: 'avatars',
  allowClientCode: true,
  onBeforeUpload(file) {
    if (file.size <= 72000 && file.type.startsWith('image/')) {
      return true;
    }
    return 'avatar-too-big';
  },
});
```

# Testing

```
npm install
npm test
```