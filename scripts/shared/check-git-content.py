#!/usr/bin/env python3
"""Check publishable working files, or reachable Git history, without printing sensitive values."""
import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def optional_config(key):
    result = subprocess.run(['git', 'config', '--get', key], cwd=ROOT, capture_output=True)
    return result.stdout.strip()

account = Path.home().name.encode()
email = optional_config('user.email')
if email.lower().endswith((b'@example.invalid', b'@users.noreply.github.com')):
    email = b''  # Anonymous/public commit addresses are not private account email.
brands = [b'op' + b'po', b'hey' + b'tap', b'color' + b'os', b'one' + b'plus', b'real' + b'me']
patterns = {
    'brand reference': re.compile(rb'(?i)\b(?:' + b'|'.join(brands) + rb')\b'),
    'private key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'credential': re.compile(rb'\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-live-[A-Za-z0-9]{16,})\b'),
}
if account.isdigit() and len(account) >= 6:
    patterns['local account identifier'] = re.compile(re.escape(account))
if email:
    patterns['local Git email'] = re.compile(re.escape(email), re.I)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--history', action='store_true', help='Inspect all reachable commits; read-only, no history rewriting.')
options = parser.parse_args()
findings = []
seen = {}
checked = 0
manifest = json.loads((ROOT / 'scripts/shared/native-resources.json').read_text())
retained_sdk = {item['path']: item['sha256'] for item in manifest['files']
                if item['path'].startswith('tools/hdc/') and not item['path'].endswith('README.md')}
known_sdk_paths = set()

def review_sdk_metadata(name, digest, labels):
    if retained_sdk.get(name) == digest and 'non-synthetic home directory path' in labels:
        known_sdk_paths.add(name)
        return [label for label in labels if label != 'non-synthetic home directory path']
    return labels

def scan(data):
    labels = [label for label, pattern in patterns.items() if pattern.search(data)]
    paths = re.finditer(rb'(?:/Users/|/home/)([A-Za-z0-9_.-]{1,80})/', data)
    if any(match.group(1) not in {b'user', b'test.name', b'another', b'runner', b'build'} for match in paths):
        labels.append('non-synthetic home directory path')
    return labels

if options.history:
    commits = git('rev-list', '--all').decode().splitlines()
    for commit in commits:
        # Author/committer addresses are part of what a push exposes.
        metadata = git('show', '-s', '--format=%ae%n%ce', commit)
        if email and email.lower() in metadata.lower():
            findings.append((commit[:8], '(commit metadata)', ['local Git email']))
        for item in git('ls-tree', '-r', '-z', commit).split(b'\0'):
            if not item:
                continue
            header, raw_name = item.split(b'\t', 1)
            mode, kind, oid = header.split()
            if kind != b'blob':
                continue
            name = os.fsdecode(raw_name)
            if oid not in seen:
                data = git('cat-file', 'blob', oid.decode())
                seen[oid] = (scan(data), hashlib.sha256(data).hexdigest())
                checked += 1
            labels = review_sdk_metadata(name, seen[oid][1], list(seen[oid][0]))
            if name == 'notes/verification/device-layout.png':
                labels.append('historical device screenshot needs removal/review')
            if labels:
                findings.append((commit[:8], name, labels))
    scope = f'{len(commits)} reachable commits; {checked} unique blobs'
else:
    names = set(filter(None, git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0')))
    for raw_name in sorted(names):
        name = os.fsdecode(raw_name)
        file = ROOT / name
        if not file.is_file() or file.is_symlink():
            continue
        checked += 1
        data = file.read_bytes()
        labels = review_sdk_metadata(name, hashlib.sha256(data).hexdigest(), scan(data))
        if labels:
            findings.append(('working', name, labels))
    scope = f'{checked} publishable working files'

print('Checked:', scope)
if known_sdk_paths:
    print(f'Known original SDK build-path metadata retained: {len(known_sdk_paths)} checksum-matched files (not a license certification).')
for revision, name, labels in findings[:60]:
    print(f'{revision}: {name}: {", ".join(labels)}')
if len(findings) > 60:
    print(f'{len(findings) - 60} additional findings omitted; sensitive values are never printed.')
print('FAIL' if findings else 'PASS', f'({len(findings)} findings)')
raise SystemExit(1 if findings else 0)
