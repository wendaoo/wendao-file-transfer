#!/usr/bin/env python3
"""Export reviewable source without local accounts, generated files or native binaries."""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT.parent / 'wendao-file-transfer-source-share.zip'
if OUTPUT.exists():
    raise SystemExit('Export already exists; move it aside before generating another snapshot.')
paths = subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT
).decode().split('\0')
excluded = []
included = []
for relative in sorted(set(filter(None, paths))):
    p = ROOT / relative
    parts = Path(relative).parts
    skip = (
        not p.is_file() or p.is_symlink()
        or any(part in {'.git', '.cache', 'node_modules', 'dist', 'dll'} for part in parts)
        or relative.startswith(('build/mac/bin/', 'build/ios/', 'tools/adb/', 'tools/hdc/',
                                'build/mirror/', 'blobs/binaries/', 'notes/verification/'))
        or p.suffix in {'.map', '.dmg', '.zip', '.gz', '.dylib', '.node', '.pem', '.p12'}
    )
    # Keep notices/provenance even when a resource is excluded.
    if relative.startswith(('tools/adb/', 'tools/hdc/', 'build/mirror/')) and p.name in {
        'README.md', 'NOTICE.txt', 'LICENSE.scrcpy', 'SHA256SUMS.txt'
    }:
        skip = False
    if skip:
        excluded.append(relative)
    else:
        included.append(relative)

issues = []
for relative in included:
    data = (ROOT / relative).read_bytes()
    if b'\0' in data:
        continue
    text = data.decode('utf-8', errors='replace')
    # Public upstream attribution and synthetic test identities remain intact.
    brands = ['op' + 'po', 'hey' + 'tap', 'color' + 'os', '欧' + '珀', '欧' + '加']
    patterns = ['(?i)' + '|'.join(re.escape(value) for value in brands),
                r'/Users/[0-9]{8}|[a-z0-9._%+-]+@(?:corp|internal)\.',
                r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
    if any(re.search(pattern, text) for pattern in patterns):
        issues.append(relative)
if issues:
    print('Export blocked by findings in:', '\n'.join(issues), file=sys.stderr)
    raise SystemExit(1)

with zipfile.ZipFile(OUTPUT, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    for relative in included:
        archive.write(ROOT / relative, 'wendao-file-transfer/' + relative)
    archive.writestr('SOURCE-SHARE-NOTICE.txt',
        'Source snapshot only. No Git history, caches, dependency installation, device verification '
        'screenshots, generated app bundles or bundled native binaries. Native resources are required '
        'separately to build. Public upstream copyright/license notices are retained. This snapshot '
        'is not a security or legal certification; Electron migration and native release review remain incomplete.\n')
print(json.dumps({'output': str(OUTPUT), 'included': len(included), 'excluded': len(excluded)}, ensure_ascii=False))
