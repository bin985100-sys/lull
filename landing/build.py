# Сборка лендинга: подставляем иконки приложения, логотип, QR и сетку дней в src.html → index.html
import json, re, random, pathlib
here = pathlib.Path(__file__).parent
icons = json.load(open(here / 'icons.json'))
s = (here / 'src.html').read_text()
def icon(m):
    svg = icons[m.group(1)]
    return svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ', 1)
s = re.sub(r'\{\{icon:(\w+)\}\}', icon, s)
mark = (here / 'assets/lull-mark.svg').read_text()
mark = re.sub(r'<\?xml[^>]*>\s*', '', mark).replace('<svg ', '<svg aria-hidden="true" ', 1)
s = s.replace('{{logo}}', mark)
qr = re.sub(r'<\?xml[^>]*>\s*', '', (here / 'assets/qr.svg').read_text()).replace('<svg ', '<svg role="img" aria-label="QR-код: lull.website" ', 1)
s = s.replace('{{qr}}', qr)
random.seed(7)
s = s.replace('{{days}}', ''.join('<i class="%s"></i>' % random.choice(['', '', 'a', 'a', 'b']) for _ in range(30)))
(here / 'index.html').write_text(s)
print('ok', len(s))
