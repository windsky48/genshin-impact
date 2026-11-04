#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把本地工作区的文件同步到 GitHub 远端 —— 直接走 Git Data API。

相比逐个文件誊写内容再调用 MCP，本脚本的内容直接来自本地字节流，
零转录风险（之前就因为誊写把 eslint-plugin-svelte3 写成了 ^4.10.0 导致构建失败）。

用法: python sync_to_github.py "<提交信息>"
"""
import base64, io, json, os, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = 'windsky48/genshin-impact'
BRANCH = 'main'
API = 'https://api.github.com/repos/' + REPO

SKIP_DIRS = ('node_modules', '.svelte-kit', '.vercel')
SKIP_PREFIX = ('dist/', 'build/')
SKIP_NAMES = ('_verify_remote.py', 'tree.json')


def get_token():
    cfg = json.load(io.open(os.path.expanduser('~/.workbuddy/mcp.json'), encoding='utf-8'))

    def find(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'custom-github':
                    return v
                r = find(v)
                if r:
                    return r
        elif isinstance(o, list):
            for v in o:
                r = find(v)
                if r:
                    return r
        return None

    return find(cfg)['headers']['Authorization'].split(' ', 1)[1]


TOKEN = get_token()
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method, path, payload=None, raw=False):
    url = API + path
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    })
    with OPENER.open(req, timeout=60) as r:
        body = r.read()
        if raw:
            return body
        return json.loads(body.decode('utf-8'))


def collect_files():
    out = subprocess.run(
        ['git', '-c', 'core.quotepath=false', 'status', '--porcelain'],
        capture_output=True, text=True, cwd=ROOT).stdout

    def skip(p):
        return (any(('/%s/' % d) in ('/' + p) for d in SKIP_DIRS)
                or p.startswith(SKIP_PREFIX)
                or p in SKIP_NAMES
                or '_stale_' in p)

    files = set()
    for line in out.splitlines():
        if not line.strip():
            continue
        p = line[3:].strip().strip('"')
        if p.endswith('/'):
            for r, _, fs in os.walk(os.path.join(ROOT, p)):
                for f in fs:
                    rel = os.path.relpath(os.path.join(r, f), ROOT).replace('\\', '/')
                    if not skip(rel):
                        files.add(rel)
        elif not skip(p):
            files.add(p)
    return sorted(files)


def main():
    message = sys.argv[1] if len(sys.argv) > 1 else 'sync: 同步本地文件到远端'
    files = collect_files()
    print('待同步文件:', len(files))

    ref = api('GET', '/git/ref/heads/' + BRANCH)
    head_sha = ref['object']['sha']
    commit = api('GET', '/git/commits/' + head_sha)
    base_tree = commit['tree']['sha']
    print('远端 HEAD:', head_sha[:12], ' base tree:', base_tree[:12])

    entries = []
    changed = 0
    for path in files:
        full = os.path.join(ROOT, path)
        if not os.path.isfile(full):
            continue
        raw = open(full, 'rb').read()
        # 统一成 LF，和仓库其余文件保持一致
        text = raw.decode('utf-8').replace('\r\n', '\n')
        blob = api('POST', '/git/blobs', {
            'content': base64.b64encode(text.encode('utf-8')).decode('ascii'),
            'encoding': 'base64'
        })
        entries.append({
            'path': path,
            'mode': '100755' if os.access(full, os.X_OK) else '100644',
            'type': 'blob',
            'sha': blob['sha']
        })
        changed += 1
        print('  blob', path)

    if not entries:
        print('没有需要同步的文件')
        return

    tree = api('POST', '/git/trees', {'base_tree': base_tree, 'tree': entries})
    new_commit = api('POST', '/git/commits', {
        'message': message,
        'tree': tree['sha'],
        'parents': [head_sha]
    })
    api('PATCH', '/git/refs/heads/' + BRANCH, {'sha': new_commit['sha'], 'force': False})
    print()
    print('已推送 commit:', new_commit['sha'])


if __name__ == '__main__':
    main()
