import ast
import unittest
from pathlib import Path
from types import SimpleNamespace

tree = ast.parse(Path(__file__).with_name('server.py').read_text())
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'cors')
namespace = {'web': SimpleNamespace(Request=object, StreamResponse=object), 'ORIGINS': {'https://app.lull.website'}}
exec(compile(ast.Module(body=[function], type_ignores=[]), 'cors', 'exec'), namespace)

class CacheCorsTest(unittest.TestCase):
    def response(self, origin='', vary=''):
        response = SimpleNamespace(headers={'Vary': vary} if vary else {})
        namespace['cors'](SimpleNamespace(headers={'Origin': origin}), response)
        return response.headers
    def test_image_without_origin_also_varies(self):
        self.assertEqual(self.response()['Vary'], 'Origin')
    def test_trusted_canvas_read(self):
        self.assertEqual(self.response('https://app.lull.website')['Access-Control-Allow-Origin'], 'https://app.lull.website')
    def test_untrusted_origin_is_not_allowed(self):
        self.assertNotIn('Access-Control-Allow-Origin', self.response('https://other.invalid'))
    def test_encoding_variation_is_preserved(self):
        self.assertEqual(self.response(vary='Accept-Encoding')['Vary'], 'Accept-Encoding, Origin')
        self.assertEqual(self.response(vary='origin')['Vary'], 'origin')

if __name__ == '__main__':
    unittest.main()
