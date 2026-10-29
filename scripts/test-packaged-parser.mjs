import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Parser, Helpers } from 'youtubei.js';
import { installParserDiagnostics } from '../electron/yt-parser.ts';

const require = createRequire(import.meta.url);
const metadata = require(path.resolve(path.dirname(require.resolve('youtubei.js')), '../../package.json'));
const originalBugs = metadata.bugs;
const originalKeys = Object.keys(metadata);
try {
  // Reproduce electron-builder's dependency metadata cleanup in memory only.
  delete metadata.bugs;
  class LullMalformedCard extends Helpers.YTNode {
    static type = 'LullMalformedCard';
    constructor() { super(); throw new Error('Malformed upstream card'); }
  }
  Parser.addRuntimeParser('LullMalformedCard', LullMalformedCard);
  const broken = { lullMalformedCardRenderer: {} };
  assert.throws(() => Parser.parseItem(broken), /reading 'url'/);

  const warnings = [];
  installParserDiagnostics((message) => warnings.push(message));
  assert.equal(Parser.parseItem(broken), null);
  assert.ok(warnings.some((message) => message.includes('Malformed upstream card')));

  const valid = { musicTwoRowItemRenderer: {
    title: { simpleText: 'Example album' },
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [] } } },
    subtitle: { runs: [{ text: 'Example artist' }, { text: '2026' }] },
    navigationEndpoint: { browseEndpoint: { browseId: 'MPRE-example',
      browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' } } } }
  } };
  const cards = Parser.parseArray([broken, valid]);
  assert.equal(cards.length, 1, warnings.join('\n'));
  assert.equal(cards[0].id, 'MPRE-example');
  assert.equal(cards[0].title.toString(), 'Example album');
  console.log('PASS: packaged metadata crash reproduced; malformed card skipped, valid card preserved.');
} finally {
  if (originalKeys.includes('bugs')) metadata.bugs = originalBugs;
}
