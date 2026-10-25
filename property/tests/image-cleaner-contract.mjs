import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Backoffice Image Cleaner: hidden info is removed from each format, pixels are
// left alone, and the page never uploads anything.
const require = createRequire(import.meta.url);
const cleaner = require('../backoffice/image-cleaner/strip-metadata.js');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };
const text = (bytes) => Buffer.from(bytes).toString('latin1');

// 8x8 test images carrying a camera name, GPS, XMP, IPTC, comments and text chunks.
const fixtures = {
  jpeg: '/9j/7QApUGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAABAcAlAACFNFQ1JFVElQ/+AAEEpGSUYAAQEAAAEAAQAA/+EAekV4aWYAAE1NACoAAAAIAAMBDwACAAAACgAAADIBEgADAAAAAQAGAACIJQAEAAAAAQAAADwAAAAAU0VDUkVUQ0FNAAACAAEAAgAAAAJOAAAAAAIABQAAAAMAAABaAAAAAAAAACcAAAABAAAALAAAAAEAAAAVAAAAAv/hAFhodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iPlNFQ1JFVFhNUDwveDp4bXBtZXRhPv/+AA9TRUNSRVRDT01NRU5U/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/9sAQwEREhIYFRgvGhovY0I4QmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj/8AAEQgACAAIAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8Ay6KKK4j6Y//ZU0VDUkVUVFJBSUxFUg==',
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEXRFWHRBdXRob3IAU0VDUkVUVEVYVDbCnVUAAAByZVhJZk1NACoAAAAIAAMBDwACAAAACgAAADIBEgADAAAAAQAGAACIJQAEAAAAAQAAADwAAAAAU0VDUkVUQ0FNAAACAAEAAgAAAAJOAAAAAAIABQAAAAMAAABaAAAAAAAAACcAAAABAAAALAAAAAEAAAAVAAAAAuQiB2cAAAAUSURBVHicYzyhocGADTBhFR20EgDgOAEonyUJCgAAAABJRU5ErkJggg==',
  webp: 'UklGRgQBAABXRUJQVlA4WAoAAAAMAAAABwAABwAAVlA4ICoAAACQAQCdASoIAAgAAsBMJaACdLoAA5gA/uwmX18AU9Uf/OJfyR+gXaAAAABFWElGcgAAAE1NACoAAAAIAAMBDwACAAAACgAAADIBEgADAAAAAQAGAACIJQAEAAAAAQAAADwAAAAAU0VDUkVUQ0FNAAACAAEAAgAAAAJOAAAAAAIABQAAAAMAAABaAAAAAAAAACcAAAABAAAALAAAAAEAAAAVAAAAAlhNUCA5AAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyI+U0VDUkVUWE1QPC94OnhtcG1ldGE+AA==',
  gif: 'R0lGODlhCAAIAIEAAMwAAJkzM8wzMwAAACH+CVNFQ1JFVEdJRgAsAAAAAAgACAAACB4ABQgcOBCAAIMGCSo8KBAhwQACITJMmHBhw4sGAwIAOw=='
};

for (const [type, b64] of Object.entries(fixtures)) {
  const input = new Uint8Array(Buffer.from(b64, 'base64'));
  must(/SECRET/.test(text(input)), `${type} fixture must start with hidden info.`);
  const result = cleaner.strip(input);
  must(result.supported && result.type === type, `${type} must be detected and supported.`);
  must(!/SECRET/.test(text(result.bytes)), `${type}: hidden info must be gone.`);
  must(result.removed.length > 0, `${type}: must report what was removed.`);
  must(cleaner.strip(result.bytes).bytes.length === result.bytes.length, `${type}: cleaning twice must change nothing.`);
}

const jpeg = cleaner.strip(new Uint8Array(Buffer.from(fixtures.jpeg, 'base64')));
const out = jpeg.bytes;
must(out[0] === 0xFF && out[1] === 0xD8 && out[out.length - 2] === 0xFF && out[out.length - 1] === 0xD9, 'JPEG must start and end with the image markers (data after the end is dropped).');
must(jpeg.removed.includes('GPS location') && jpeg.removed.includes('IPTC') && jpeg.removed.includes('XMP') && jpeg.removed.includes('Comment'), 'JPEG must report GPS, IPTC, XMP and comments.');
must(jpeg.kept.includes('Rotation') && /Exif\0\0MM\0\*\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01\0\x06/.test(text(out)), 'JPEG must keep only the rotation flag so sideways photos stay upright.');

const webp = cleaner.strip(new Uint8Array(Buffer.from(fixtures.webp, 'base64'))).bytes;
must(Buffer.from(webp).readUInt32LE(4) === webp.length - 8, 'WebP RIFF size must match the cleaned file.');
must(cleaner.strip(new Uint8Array([1, 2, 3, 4])).supported === false, 'Unknown files must not be passed through as cleaned.');

const page = read('property/backoffice/image-cleaner/index.html');
const js = read('property/backoffice/image-cleaner/image-cleaner.js');
must(/data-access-require="developer"/.test(page), 'Image Cleaner stays behind the developer gate.');
must(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(page), 'Image Cleaner must not be indexed.');
must(/fflate@0\.8\.2\/umd\/index\.js" integrity="sha384-/.test(page), 'fflate must be pinned with an integrity hash.');
must(!/fetch\(|XMLHttpRequest|sendBeacon|FormData/.test(js), 'Image Cleaner must never upload files.');

console.log('Image Cleaner contract passed');
