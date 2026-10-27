import { Parser } from 'youtubei.js';

/** Packaged dependencies have their issue-tracker metadata stripped by electron-builder.
 * The default parser reporter reads that metadata and can throw instead of skipping
 * an unsupported card. Keep diagnostics without letting the reporter break the feed.
 */
export function installParserDiagnostics(warn: (message: string) => void = (message) => console.warn(message)) {
  Parser.setParserErrorHandler((event) => {
    const detail = event.error_type === 'parse' && event.error instanceof Error
      ? `: ${event.error.message}`
      : '';
    warn(`[yt-parser] ${event.classname} (${event.error_type})${detail}`);
  });
}
