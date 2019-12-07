import async from 'async';
import _ from 'lodash';
import { get, set, del } from 'idb-keyval';

function initialize() {
  function findOrFetch(name) {
    return new Promise(resolve => {
      get(name).then(localVersion => {
        resolve(JSON.parse(localVersion));
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
          }, 100)
        }).catch(err => callback('Delete request failed'));
      }
    }))
  }

  function initializeData(name, defaultData) {
    return new Promise(resolve => {
      get(name).then(cachedData => {
        cachedData = cachedData && JSON.parse(cachedData);
        resolve(cachedData);
    })
  })
  }

  function syncByRevision(name, newData) {
    newData.revision++;
    return new Promise(resolve => {
      set(name, JSON.stringify(newData))
      .then((data) => resolve(data));
    });
  }


  return { deleteFile,
    deleteFiles,
    findOrFetch,
    findOrFetchFiles,
    syncByRevision,
    initializeData }
}

export default initialize;
