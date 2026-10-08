require('@babel/register');
const assert = require('assert');
const Module = require('module');
const path = require('path');
const { execFile } = require('child_process');
const originalLoad = Module._load;
const externalCalls = [];

Module._load = function(request, ...args) {
  if (request === 'electron') return { shell: { openExternal: async url => externalCalls.push(url) } };

  if (request.endsWith('/utils/log')) return { log: { error() {}, doLog() {} } };
  if (request.endsWith('/helpers/binaries')) return { mtpCliPath: '/tmp/mtp cli' };
  if (request.endsWith('/constants/paths')) return { PATHS: { homeDir: '/Users/test.name' } };
  if (request.endsWith('/utils/funcs')) return {
    undefinedOrNull: value => value == null,
    isEmpty: value => value == null || value.length === 0,
    isArray: Array.isArray,
    splitIntoLines: value => value == null ? [] : String(value).split('\n'),
  };
  if (request.endsWith('/utils/files')) return { baseName: path.basename, getExtension: () => '' };
  if (request.endsWith('/utils/checkIf')) return { checkIf() {} };
  if (request === '../../../constants') return { DEVICES_LABEL: {} };
  if (request.endsWith('/utils/date')) return { msToTime() {}, unixTimestampNow: () => 1 };
  return originalLoad.call(this, request, ...args);
};
const { openExternalUrl } = require('../../app/utils/url');
const { FileExplorerLegacyDataSource } = require('../../app/data/file-explorer/data-sources/FileExplorerLegacyDataSource');
const { FILE_TRANSFER_DIRECTION } = require('../../app/enums');
const { isAppNavigation, protectWebContents } = require('../../app/services/window-security');
const { redactHomeDirectory } = require('../../app/helpers/logs');
Module._load = originalLoad;
(async () => {
  for (const url of ['file:///tmp/test', 'javascript:alert(1)', 'https://user:pass@example.com', 'not-a-url']) {
    assert.strictEqual(await openExternalUrl(url), false);
  }
  assert.deepStrictEqual(externalCalls, []);
  assert.strictEqual(await openExternalUrl('https://example.com/help'), true);
  assert.deepStrictEqual(externalCalls, ['https://example.com/help']);
  const source = new FileExplorerLegacyDataSource();
  assert.strictEqual(source.execCommand, execFile);
  const calls = [];
  source.execCommand = (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(null, '', '');
  };
  const hostile = '/DCIM/$(printf INJECTED); `id` "quote" \\ backslash';
  await source.renameFile({ filePath: hostile, newFilename: '$(id)', storageId: 65537 });
  assert.strictEqual(calls[0].file, '/tmp/mtp cli');
  assert.deepStrictEqual(calls[0].args, ['storage 65537', `rename ${source._quoteMtpPath(hostile)} "$(id)"`]);
  assert(!calls[0].options.shell);
  await source.makeDirectory({ filePath: hostile, storageId: 65537 });
  await source.deleteFiles({ fileList: [hostile], storageId: 65537 });
  await source._checkMtpFileExists(hostile, 65537);
  await source.listFiles({ filePath: hostile, storageId: 65537 });
  await source.fetchDebugReport();
  assert.deepStrictEqual(calls.at(-1).args, ['pwd', '-v']);
  const transferArgs = [];
  source._transferFiles = ({ cmdArgs }) => { transferArgs.push(cmdArgs); };
  for (const direction of [FILE_TRANSFER_DIRECTION.upload, FILE_TRANSFER_DIRECTION.download]) {
    await source.transferFiles({fileList:[hostile],destination:'/tmp/$(id)',storageId:65537,direction,
      onPreprocess() {},onProgress() {},onCompleted() {},onError(e) { throw Error(String(e.error)); }});
  }
  assert.strictEqual(transferArgs.length, 2);
  assert(transferArgs.every(args => args.length === 3 && args[0] === '-e' && args[1] === 'storage 65537'));
  assert.throws(() => source._quoteMtpPath('/bad\npath'));
  assert.throws(() => source._storageCommand('1;id'));
  // A real process receives shell-looking strings literally when execFile is used.
  const received = await new Promise((resolve,reject) => execFile(process.execPath,
    ['-e','process.stdout.write(process.argv[1])',hostile],(error,stdout) => error ? reject(error) : resolve(stdout)));
  assert.strictEqual(received, hostile);
  const appUrl = 'file:///project/app/app.html';
  assert(isAppNavigation(`${appUrl}#settings`, appUrl));
  for (const url of ['https://example.com', 'file:///tmp/evil.html', `${appUrl}?injected=1`, 'javascript:alert(1)']) {
    assert(!isAppNavigation(url, appUrl));
  }
  const handlers = {};
  let popup;
  protectWebContents({setWindowOpenHandler(fn){popup=fn;},on(name,fn){handlers[name]=fn;}},appUrl);
  assert.strictEqual(popup().action,'deny');
  let prevented = false;
  handlers['will-navigate']({preventDefault(){prevented=true;}}, 'https://example.com');
  assert(prevented);
  assert.strictEqual(redactHomeDirectory('/Users/test.name/Documents/a test@example.com /Users/another/file'),
    '[home]/Documents/a [email] [home]/file');
  console.log('PASS: literal MTP arguments, transfer arguments, invalid path/storage rejection, navigation restrictions and log redaction');
})().catch(error => { console.error(error); process.exitCode = 1; });
