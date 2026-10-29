import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'relay'))
from direct_downloads import FILES, patch_html

class Downloads(unittest.TestCase):
    def test_preserves_page_and_replaces_only_installers(self):
        content = '<h1>Original landing</h1><a href="https://github.com/other/project">Source</a>'
        for name in FILES:
            content += f'<a class="button" target="_blank" href="https://github.com/bin985100-sys/lull/releases/latest/download/{name}">Get {name}</a>'
        patched = patch_html(content)
        self.assertIn('<h1>Original landing</h1>', patched)
        self.assertIn('https://github.com/other/project', patched)
        for name in FILES:
            self.assertIn(f'href="/downloads/{name}" download>', patched)
        self.assertNotIn('target=', patched)
        self.assertEqual(patch_html(patched), patched)

    def test_missing_installer_refuses_to_publish(self):
        with self.assertRaises(ValueError):
            patch_html('<a href="/downloads/Lull.apk">APK</a>')

    def test_installation_guide_with_one_download(self):
        html = '<a href="https://github.com/bin985100-sys/lull/releases/latest/download/Lull.apk">APK</a>'
        self.assertIn('href="/downloads/Lull.apk" download', patch_html(html, ()))

    def test_unknown_file_destination_is_not_rewritten(self):
        html = ''.join(f'<a href="https://unrelated.example/{name}">X</a>' for name in FILES)
        with self.assertRaises(ValueError):
            patch_html(html)

if __name__ == '__main__':
    unittest.main()
