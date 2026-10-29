"""Change only known Lull installer anchors; retain the existing landing page."""
import re
import sys
from pathlib import Path

FILES = ('Lull-Setup.exe', 'Lull-mac-arm64.dmg', 'Lull-mac-x64.dmg', 'Lull.apk')
LINK = re.compile(r'\bhref\s*=\s*([\"\x27])(.*?)\1', re.I)

def patch_html(html, required=FILES):
    found = set()
    def anchor(match):
        tag = match.group(0)
        href = LINK.search(tag)
        if not href:
            return tag
        value = href.group(2)
        name = value.rsplit('/', 1)[-1]
        if name not in FILES:
            return tag
        allowed = (f'/downloads/{name}', f'https://lull.website/downloads/{name}')
        github = re.fullmatch(r'https://github\.com/bin985100-sys/lull/releases/(?:latest/download|download/[^/]+)/' + re.escape(name), value)
        if value not in allowed and not github:
            return tag
        found.add(name)
        tag = tag[:href.start()] + f'href="/downloads/{name}"' + tag[href.end():]
        tag = re.sub(r'\s+target\s*=\s*([\"\x27]).*?\1', '', tag, flags=re.I)
        if not re.search(r'\sdownload(?:\s|=|>)', tag, re.I):
            tag = tag[:-1] + ' download>'
        return tag
    result = re.sub(r'<a\b[^>]*>', anchor, html, flags=re.I)
    if set(required) - found:
        raise ValueError('Missing Lull download links: ' + ', '.join(sorted(set(required) - found)))
    return result

if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:3])
    target.write_text(patch_html(source.read_text(encoding='utf-8-sig'), () if '--partial' in sys.argv[3:] else FILES), encoding='utf-8')
