import async from 'async';
import _ from 'lodash';
import { get, set, del } from 'idb-keyval';

function initialize(gapi) {
  function create(name, data, callback) {
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

    if (!callback) {
      callback = function(file) {
        console.log(file)
      };
    }
    request.execute(callback);
  }

  function update(fileId, data, callback) {
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

    if (!callback) {
      callback = function(file) {
        console.log(file)
      };
    }
    request.execute(callback);
  }

  function find(name, callback) {
    gapi.client.drive.files.list({q: `name='${name}'`, spaces: 'appDataFolder' })
      .then(response => {
          console.log(response);
          if(response.result.files.length) {
            gapi.client.drive.files.get({ fileId: response.result.files[0].id, alt: 'media' }).then(response => {
              callback(response.result);
            });
          } else {
            callback(false);
          }
      })
  }

  function findOrFetch(name) {
    return new Promise(resolve => {
      get(name).then(localVersion => {
        if(localVersion) {
          resolve(JSON.parse(localVersion));
        } else {
          find(name, fileData => {
            resolve(fileData);
          });
        }
      })
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
        create(file.name, file.data, (result) => {
          if(!result.name) {
              callback(`Create request failed for ${file.name}`);
            } else {
              callback();
            }
          })}
      }))
  }


  function initializeData(name, defaultData) {
    return new Promise(resolve => {
      find(name, remoteData => {
        get(name).then(cachedData => {
          cachedData =  cachedData && JSON.parse(cachedData);

          // normal page reload
          if(cachedData && remoteData) {
            if(remoteData.revision >= cachedData.revision) {
              resolve(remoteData);
            } else {
              resolve(cachedData)
            }
          }

          // file does not yet exist on server, perhaps internet not available during file creation
          if(cachedData && !remoteData) {
            create(name, cachedData, response => {
              console.log(response);
              cachedData.fileId = response.id;
              set(name, JSON.stringify(cachedData));
              resolve(cachedData);
            });
          }

          // new device
          if(!cachedData && remoteData) {
            set(name, JSON.stringify(remoteData))
            resolve(remoteData);
          }

          // app being loaded for the first time
          if(!cachedData && !remoteData) {
            set(name, JSON.stringify(defaultData));
            create(name, defaultData, response => {
              console.log(response);
              defaultData.fileId = response.id;
              set(name, JSON.stringify(defaultData));
              resolve(defaultData);
            });
          }
        })
        })
    })
  }

  function syncByRevision(name, newData) {
    newData.revision++;
    set(name, JSON.stringify(newData));
    return new Promise(resolve => {
      find(name, remoteData => {
        console.log(remoteData);
        if(remoteData.revision >= newData.revision) {
          // if the server version is at a higher revision, use the server version (fast-forward)
          set(name, JSON.stringify(remoteData));
          resolve(remoteData);
        } else {
          // otherwise use the new version and update server version
          set(name, JSON.stringify(newData));
          console.log(`Updating ${name}, fileId ${newData.fileId}`);
          update(newData.fileId, newData);
          resolve(newData);
        }
      })
    })
  }


  return { create,
    createFiles,
    update,
    find,
    deleteFile,
    deleteFiles,
    findOrFetch,
    findOrFetchFiles,
    syncByRevision,
    initializeData }
}

export default initialize;
