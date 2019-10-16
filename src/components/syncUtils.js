function initialize(gapi) {
  function create(name, data, callback) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
      name,
      mimeType: 'application/json',
      parents: [{id: 'appDataFolder'}]
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
    gapi.client.drive.files.list({q: `name = '${name}'`, spaces: 'appDataFolder' })
      .then(response => {
          if(response.result.files.length) {
            callback(response.result.files[0]);
          } else {
            callback(false);
          }
      })
  }

  return { create, update, find }
}

export default initialize;
