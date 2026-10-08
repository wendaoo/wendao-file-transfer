// Keep the Go MTP library outside the renderer: a USB/native failure must not
// take the file browser down with it.
const koffi = require('koffi');

const lib = koffi.load(process.argv[2]);
const callbackType = koffi.proto('void on_cb_result_t(char*)');
const signatures = {
  initialize: 'void Initialize(on_cb_result_t* onDonePtr)',
  fetchDeviceInfo: 'void FetchDeviceInfo(on_cb_result_t* onDonePtr)',
  listStorages: 'void FetchStorages(on_cb_result_t* onDonePtr)',
  fileExist: 'void FileExists(char* input, on_cb_result_t* onDonePtr)',
  deleteFile: 'void DeleteFile(char* input, on_cb_result_t* onDonePtr)',
  makeDirectory: 'void MakeDirectory(char* input, on_cb_result_t* onDonePtr)',
  renameFile: 'void RenameFile(char* input, on_cb_result_t* onDonePtr)',
  walk: 'void Walk(char* input, on_cb_result_t* onDonePtr)',
  download:
    'void DownloadFiles(char* input, on_cb_result_t* onPreprocessPtr, on_cb_result_t* onProgressPtr, on_cb_result_t* onDonePtr)',
  upload:
    'void UploadFiles(char* input, on_cb_result_t* onPreprocessPtr, on_cb_result_t* onProgressPtr, on_cb_result_t* onDonePtr)',
  dispose: 'void Dispose(on_cb_result_t* onDonePtr)',
};

function normalize(raw) {
  const value = JSON.parse(raw);

  return {
    error: value.error || null,
    stderr: value.errorType || null,
    data: value.data,
  };
}

function inputFor(method, args) {
  if (method === 'walk')
    return {
      storageId: args.storageId,
      fullPath: args.fullPath,
      recursive: false,
      skipDisallowedFiles: false,
      skipHiddenFiles: args.skipHiddenFiles,
    };
  if (method === 'fileExist' || method === 'deleteFile')
    return { storageId: args.storageId, files: args.files };
  if (method === 'renameFile')
    return {
      storageId: args.storageId,
      fullPath: args.fullPath,
      newFileName: args.newFilename,
    };
  if (method === 'makeDirectory') return args;
  if (method === 'download' || method === 'upload')
    return {
      storageId: args.storageId,
      sources: args.sources,
      destination: args.destination,
      preprocessFiles: args.preprocessFiles,
    };

  return null;
}

async function call(id, method, args) {
  const signature = signatures[method];

  if (!signature) throw new Error('MTP operation is not supported');
  const native = lib.func(signature);
  const transfer = method === 'download' || method === 'upload';
  const input = inputFor(method, args);

  return new Promise((resolve) => {
    const callbacks = [];
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const register = (type) => {
      const pointer = koffi.register((raw) => {
        try {
          const value = normalize(raw);

          if (type === 'done') done(value);
          else if (process.send) process.send({ id, type, value });
        } catch (error) {
          done({ error: error.message, stderr: null, data: null });
        }
      }, koffi.pointer(callbackType));

      callbacks.push(pointer);

      return pointer;
    };
    const callArgs = [];

    if (input) callArgs.push(JSON.stringify(input));
    if (transfer) callArgs.push(register('preprocess'), register('progress'));
    callArgs.push(register('done'));
    try {
      native.async(...callArgs, (error) => {
        callbacks.forEach((pointer) => koffi.unregister(pointer));
        if (error) done({ error: error.message, stderr: null, data: null });
      });
    } catch (error) {
      callbacks.forEach((pointer) => koffi.unregister(pointer));
      done({ error: error.message, stderr: null, data: null });
    }
  });
}

let queue = Promise.resolve();

process.on('message', ({ id, method, args }) => {
  queue = queue.then(async () => {
    try {
      const value = await call(id, method, args);

      if (process.send) process.send({ id, type: 'done', value });
    } catch (error) {
      if (process.send)
        process.send({
          id,
          type: 'done',
          value: {
            error: error.message,
            stderr: null,
            data: null,
          },
        });
    }

    return null;
  });
});
