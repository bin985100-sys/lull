import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from aiohttp import web

# Load the real header function without starting yt-dlp or relay storage.
tree=ast.parse((Path(__file__).resolve().parent.parent/'relay/server.py').read_text(encoding='utf-8-sig'))
function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='cors')
namespace={'web':web,'ORIGINS':{'https://app.lull.website'}}
exec(compile(ast.Module(body=[function],type_ignores=[]),'relay-cors','exec'),namespace)
cors=namespace['cors']

class ImageCors(unittest.TestCase):
    def test_plain_image_response_varies_by_origin(self):
        response=cors(SimpleNamespace(headers={}),web.Response())
        self.assertEqual(response.headers['Vary'],'Origin')
        self.assertNotIn('Access-Control-Allow-Origin',response.headers)

    def test_canvas_response_allows_app_origin(self):
        response=cors(SimpleNamespace(headers={'Origin':'https://app.lull.website'}),web.Response())
        self.assertEqual(response.headers['Access-Control-Allow-Origin'],'https://app.lull.website')
        self.assertEqual(response.headers['Vary'],'Origin')

    def test_preserves_other_cache_dimensions(self):
        response=cors(SimpleNamespace(headers={}),web.Response(headers={'Vary':'Accept-Encoding'}))
        self.assertEqual(response.headers['Vary'],'Accept-Encoding, Origin')
        cors(SimpleNamespace(headers={}),response)
        self.assertEqual(response.headers['Vary'],'Accept-Encoding, Origin')

if __name__=='__main__':unittest.main()
