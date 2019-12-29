import async from 'async';
import _ from 'lodash';
import { get, set, del } from 'idb-keyval';

function initialize(gapi) {
  function create(name, data) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
      name,
      mimeType: 'application/json',
      parents: ['appDataFolder']
    };

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(data) +
        close_delim;

    const request = gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: {uploadType: 'multipart'},
        headers: {
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody});

    return new Promise(resolve => {
      request.execute(result => resolve(result));
    })
  }

  function createImage(name, dataUrl) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const mimeType = dataUrl.match(/data:(image\/[a-z]+);/)[1]
    const data = dataUrl.split(',')[1];
    const metadata = {
      name,
      mimeType,
      parents: ['appDataFolder']
    };

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n` +
        data +
        close_delim;

    const request = gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: {uploadType: 'multipart'},
        headers: {
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody});

    return new Promise(resolve => {
      request.execute(result => resolve(result));
    })
  }

  function update(fileId, data) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
      mimeType: 'application/json'
    };

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(data) +
        close_delim;

    const request = gapi.client.request({
        path: `/upload/drive/v3/files/${fileId}`,
        method: 'PATCH',
        params: {uploadType: 'multipart'},
        headers: {
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody});

    return new Promise(resolve => {
      request.execute(result => resolve(result));
    });
  }

  function find(name) {
    return gapi.client.drive.files.list({q: `name='${name}'`, spaces: 'appDataFolder' })
      .then(response => {
          console.log(response);
          if(response.result.files.length) {
            return gapi.client.drive.files.get({ fileId: response.result.files[0].id, alt: 'media' }).then(response => {
              return response.result;
            });
          } else {
            return false;
          }
      })
  }

  function getPagesForDoc(docId) {
    return new Promise((resolve, reject) => {
      gapi.client.drive.files.list({q: `name contains '${docId}'`, spaces: 'appDataFolder', pageSize: 1000 })
      .then(response => {
          console.log(response);
          resolve(response.result.files.map(f => f.name).filter(name => name !== docId));
      }).catch(e => reject())
    })
  }

  function findOrFetch(name) {
    return get(name).then(localVersion => {
        if(localVersion) {
          return JSON.parse(localVersion);
        } else {
          return find(name);
        }
      })
  }

  function findOrFetchFiles(names) {
    return async.series(names.map(name => {
      return function(callback) {
        findOrFetch(name).then(result => {
          if(result) {
            callback(null, result)
          } else {
            callback(`Could not find file ${name}`, null)
          }
        })
      }}))
  }

  function deleteFile(name) {
    del(name);
    return new Promise(resolve => {
    gapi.client.drive.files.list({q: `name='${name}'`, spaces: 'appDataFolder' })
      .then(response => {
          console.log(response);
          if(response.result.files.length) {
            gapi.client.drive.files.delete({ fileId: response.result.files[0].id }).then(resolve)
          } else {
            resolve(false);
          }})
    })
  }

  function deleteFiles(names) {
    return async.series(names.map(name => {
      return function(callback) {
        deleteFile(name).then(result => {
          setTimeout(() => {
            if(!(result.status === 204)) {
              callback(`Delete request failed for ${name}`);
            } else {
              callback();
            }
          }, 1500)
        }).catch(err => callback('Delete request failed'));
      }
    }))
  }


  function createFiles(files) {
    return async.series(files.map(file => {
      return function(callback) {
        create(file.name, file.data).then(result => {
          if(!result.name) {
              callback(`Create request failed for ${file.name}`);
            } else {
              callback();
            }
          })}
      }))
  }


  function initializeData(name, defaultData) {
    return find(name).then(remoteData => {
        return get(name).then(cachedData => {
          cachedData =  cachedData && JSON.parse(cachedData);

          // normal page reload
          if(cachedData && remoteData) {
            if(remoteData.revision >= cachedData.revision) {
              return remoteData;
            } else {
              return cachedData
            }
          }

          // file does not yet exist on server
          if(cachedData && !remoteData) {
            return create(name, cachedData).then(response => {
              console.log(response);
              cachedData.fileId = response.id;
              set(name, JSON.stringify(cachedData));
              return syncByRevision(name, cachedData);
            });
          }

          // new device
          if(!cachedData && remoteData) {
            set(name, JSON.stringify(remoteData))
            return remoteData;
          }

          // app being loaded for the first time
          if(!cachedData && !remoteData) {
            set(name, JSON.stringify(defaultData));
            return create(name, defaultData).then(response => {
              console.log(response);
              defaultData.fileId = response.id;
              set(name, JSON.stringify(defaultData));
              return syncByRevision(name, defaultData);
            });
          }
        })
    })
  }

  function syncByRevision(name, newData) {
    newData.revision++;
    set(name, JSON.stringify(newData));
    return find(name).then(remoteData => {
        console.log(remoteData);
        if(remoteData.revision >= newData.revision) {
          // if the server version is at a higher revision, use the server version (fast-forward)
          set(name, JSON.stringify(remoteData));
          return remoteData;
        } else {
          // otherwise use the new version and update server version
          set(name, JSON.stringify(newData));
          console.log(`Updating ${name}, fileId ${newData.fileId}`);
          return update(newData.fileId, newData).then(() => newData);
        }
      })
  }


  return { create,
    createImage,
    createFiles,
    update,
    find,
    deleteFile,
    deleteFiles,
    findOrFetch,
    findOrFetchFiles,
    syncByRevision,
    initializeData,
    getPagesForDoc}
}

export default initialize;
