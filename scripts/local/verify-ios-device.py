#!/usr/bin/env python3
"""Explicit live test: creates/deletes only its UUID test directory in a shared app."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import tempfile
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--app', required=True, help='Bundle id of a file-sharing app')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
arch = 'arm64' if platform.machine() == 'arm64' else 'amd64'
helper = root / 'build/ios' / arch / 'bin/ios-files'
session = {}


def call(operation, expect_error=False, **options):
    request = dict(session, operation=operation, **options)
    process = subprocess.run([str(helper)], input=json.dumps(request), capture_output=True, text=True, timeout=90, check=True)
    messages = [json.loads(line) for line in process.stdout.splitlines()]
    result = messages[-1]
    assert bool(result['error']) == expect_error, result
    return result['data'] if not expect_error else result['error']


device = call('connect')
assert device and device['transport'] == 'ios'
session.update(serial=device['usbDeviceInfo']['SerialNumber'], storageId=65538)
apps = call('listFiles', filePath='/', ignoreHidden=True)
assert '/' + args.app in [a['path'] for a in apps]
remote = '/' + args.app + '/OpenMTP-test-' + str(uuid.uuid4())
created = False
with tempfile.TemporaryDirectory(prefix='openmtp-ios-') as local:
    local = Path(local)
    source = local / '中文 测试文件夹'
    (source / '空文件夹').mkdir(parents=True)
    (source / 'zero.txt').touch()
    (source / "引号' 和空格.txt").write_text('Mac ↔ iPhone\n文件共享测试\n')
    (source / 'binary.bin').write_bytes(bytes(range(256)) * 16384)
    destination = local / 'download'
    destination.mkdir()
    try:
        call('makeDirectory', filePath=remote)
        created = True
        call('transferFiles', fileList=[str(source)], destination=remote, direction='upload')
        uploaded = remote + '/' + source.name
        call('transferFiles', fileList=[uploaded], destination=str(destination), direction='download')
        for f in source.rglob('*'):
            target = destination / source.name / f.relative_to(source)
            if f.is_dir(): assert target.is_dir()
            else: assert hashlib.sha256(f.read_bytes()).digest() == hashlib.sha256(target.read_bytes()).digest()
        call('transferFiles', True, fileList=[str(source)], destination=remote, direction='upload')
        call('transferFiles', True, fileList=[uploaded], destination=str(destination), direction='download')
        assert call('filesExist', fileList=[uploaded]) is True
        call('renameFile', filePath=uploaded + '/zero.txt', newFilename='renamed.txt')
        assert call('filesExist', fileList=[uploaded + '/renamed.txt']) is True
        assert call('filesExist', fileList=[uploaded + '/zero.txt']) is False
        call('listFiles', True, filePath='/' + args.app + '/../private', ignoreHidden=True)
        call('deleteFiles', True, fileList=['/' + args.app])
        call('transferFiles', True, fileList=[str(source)], destination='/', direction='upload')
        (local / 'link').symlink_to(source)
        call('transferFiles', True, fileList=[str(local / 'link')], destination=remote, direction='upload')
        print('PASS: shared apps, folders, UTF-8, quotes/spaces, empty files/folders, 4 MiB SHA-256 roundtrip, conflict preservation, rename, traversal/app-root/symlink rejection')
    finally:
        if created:
            call('deleteFiles', fileList=[remote])
            assert call('filesExist', fileList=[remote]) is False
            print('PASS: isolated device test directory removed')
