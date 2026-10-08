#!/usr/bin/env python3
"""Fetch relocatable, checksum-verified Homebrew bottles into this project only."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'ios-bottles'
DEST = ROOT / 'build' / 'ios'
CACHE.mkdir(parents=True, exist_ok=True)


def fetch(url, headers=()):
    args = ['curl', '-fsSL', '--retry', '2', '--max-time', '180']
    for header in headers:
        args += ['-H', header]
    return subprocess.check_output(args + [url])


def install(name, version, arch, installed):
    if name == 'ca-certificates' or name in installed:
        return
    installed.add(name)
    repository = 'homebrew/core/' + name.replace('@', '/')
    token = json.loads(fetch('https://ghcr.io/token?service=ghcr.io&scope=repository:' + repository + ':pull'))['token']
    headers = ['Authorization: Bearer ' + token, 'Accept: application/vnd.oci.image.index.v1+json']
    base = 'https://ghcr.io/v2/' + repository
    manifest = json.loads(fetch(base + '/manifests/' + version, headers))
    candidates = [m for m in manifest['manifests'] if m['platform']['architecture'] == arch and m['platform']['os'] == 'darwin' and 'ventura' in m['annotations']['org.opencontainers.image.ref.name']]
    if not candidates:
        raise RuntimeError('No Ventura bottle: ' + name + ' ' + version)
    bottle = candidates[0]['annotations']
    digest = bottle['sh.brew.bottle.digest']
    archive = CACHE / (digest + '.tar.gz')
    if not archive.exists():
        archive.write_bytes(fetch(base + '/blobs/sha256:' + digest, headers))
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest, name
    output = DEST / arch
    unpack = CACHE / (name + '-' + version + '-' + arch)
    unpack.mkdir(exist_ok=True)
    for tree in [unpack, output]:
        if tree.exists():
            for item in tree.rglob('*'):
                if not item.is_symlink(): item.chmod(item.stat().st_mode | 0o200)
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            if member.name.startswith('/') or '..' in Path(member.name).parts:
                raise RuntimeError('Unsafe archive path')
        tar.extractall(unpack)
    package = unpack / name / version
    for folder in ['include', 'lib', 'bin']:
        if (package / folder).exists():
            for item in (package / folder).rglob('*'):
                dest = output / folder / item.relative_to(package / folder)
                if item.is_symlink() and dest.is_symlink(): dest.unlink()
            shutil.copytree(package / folder, output / folder, dirs_exist_ok=True, symlinks=True)
    licenses = output / 'licenses' / name
    licenses.mkdir(parents=True, exist_ok=True)
    for f in package.iterdir():
        if f.is_file() and any(word in f.name.upper() for word in ['COPYING', 'LICENSE', 'AUTHORS', 'NOTICE']):
            shutil.copy2(f, licenses / f.name)
    (licenses / 'provenance.json').write_text(json.dumps({'package': name, 'version': version, 'sha256': digest, 'source': manifest.get('annotations', {}), 'bottle': bottle}, indent=2))
    print(name, version, arch, flush=True)
    for dep in json.loads(bottle['sh.brew.tab'])['runtime_dependencies']:
        install(dep['full_name'], dep['pkg_version'], arch, installed)


for architecture in ['amd64', 'arm64']:
    install('libimobiledevice', '1.3.0_3', architecture, set())
    output = DEST / architecture
    for f in list((output / 'lib').glob('*.dylib')) + list((output / 'bin').iterdir()):
        if f.is_symlink() or not f.is_file() or 'Mach-O' not in subprocess.check_output(['file', str(f)], text=True):
            continue
        deps = subprocess.check_output(['otool', '-L', str(f)], text=True).splitlines()[1:]
        args = ['install_name_tool']
        if f.suffix == '.dylib':
            args += ['-id', '@rpath/' + f.name]
        for dep in deps:
            old = dep.strip().split(' (')[0]
            if old.startswith(('/usr/lib/', '/System/Library/')):
                continue
            sibling = output / 'lib' / Path(old).name
            if not sibling.exists():
                raise RuntimeError('Missing dependency ' + old)
            new = ('@loader_path/' if f.suffix == '.dylib' else '@loader_path/../lib/') + sibling.name
            args += ['-change', old, new]
        subprocess.run(args + [str(f)], check=True, capture_output=True)
        subprocess.run(['codesign', '--force', '--sign', '-', str(f)], check=True, capture_output=True)
