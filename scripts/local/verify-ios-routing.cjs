require('@babel/register');
const assert = require('assert');
const Module = require('module');
const original = Module._load;
let ios = false, adb = false;
const calls = [];
class IOS {
  async connect() { calls.push('ios-connect'); return ios; }
  initialize() { return { data: { transport: 'ios' } }; }
  listFiles(options) { return { data: options.filePath }; }
  transferFiles({ onError }) { onError({ error: 'unplugged' }); }
}
class ADB {
  async connect() { calls.push('adb-connect'); return adb; }
  initialize() { return { data: { transport: 'adb' } }; }
}
class MTP {
  useNativeKernel() {}
  useHarmonyWorker() {}
  initialize() { return { data: { transport: 'mtp' } }; }
}
Module._load = function(name, ...args) {
  if (name === 'electron') return { ipcRenderer: { invoke: async () => ({ devices: [] }) } };
  if (name.endsWith('/FileExplorerHdcDataSource')) return { FileExplorerHdcDataSource: class { async connect() { return false; } } };
  if (name.endsWith('/FileExplorerIosDataSource')) return { FileExplorerIosDataSource: IOS };
  if (name.endsWith('/FileExplorerAdbDataSource')) return { FileExplorerAdbDataSource: ADB };
  if (name.endsWith('/FileExplorerKalamDataSource')) return { FileExplorerKalamDataSource: MTP };
  if (name.endsWith('/FileExplorerLegacyDataSource')) return { FileExplorerLegacyDataSource: MTP };
  if (name.endsWith('/FileExplorerLocalDataSource')) return { FileExplorerLocalDataSource: MTP };
  if (name.endsWith('/helpers/settings')) return { getMtpModeSetting: () => 'kalam' };
  return original.call(this, name, ...args);
};
(async () => {
  const { FileExplorerRepository } = require('../../app/data/file-explorer/repositories/FileExplorerRepository');
  const repo = new FileExplorerRepository(), options = { deviceType: 'mtp', storageId: 65538, filePath: '/app/Documents' };
  ios = true; adb = true;
  assert.strictEqual(await repo.prepareDevice(), true);
  assert.strictEqual((await repo.initialize(options)).data.transport, 'ios');
  assert.deepStrictEqual(calls, ['ios-connect']);
  assert.strictEqual((await repo.listFiles(options)).data, options.filePath);
  let errors = 0;
  await repo.transferFiles({ ...options, onError: () => errors++, onCompleted: () => assert.fail('False success') });
  assert.strictEqual(errors, 1);
  assert.deepStrictEqual(calls, ['ios-connect']); // Never retry a failed transfer over another protocol.
  ios = false;
  assert.strictEqual(await repo.prepareDevice(), true);
  assert.strictEqual((await repo.initialize(options)).data.transport, 'adb');
  adb = false;
  assert.strictEqual(await repo.prepareDevice(), false);
  assert.strictEqual((await repo.initialize(options)).data.transport, 'mtp');
  console.log('PASS: iOS priority, transport switching, MTP fallback, no cross-protocol retry after error');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { Module._load = original; });
