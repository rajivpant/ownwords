/**
 * Tests for image-utils module
 *
 * Tests image extraction, URL rewriting, and sidecar management.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  extractLocalImages,
  escapeRegex,
  rewriteImageUrls,
  getFileHash,
  getSidecarPath,
  loadSidecar,
  saveSidecar,
  getImagesToUpload,
  buildUrlMapFromSidecar,
  updateSidecar,
  updateFrontMatterWithWordPress,
  readWordPressMetadata
} = require('../lib/image-utils');

describe('image-utils', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownwords-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('extractLocalImages', () => {
    it('extracts markdown image with relative path', () => {
      const markdown = '![Alt text](./images/photo.jpg)';
      const images = extractLocalImages(markdown, '/test/dir');

      assert.strictEqual(images.length, 1);
      assert.strictEqual(images[0].markdownPath, './images/photo.jpg');
      assert.strictEqual(images[0].filename, 'photo.jpg');
      assert.strictEqual(images[0].altText, 'Alt text');
    });

    it('extracts multiple images', () => {
      const markdown = `
![First](./img1.png)
Some text
![Second](./img2.jpg)
`;
      const images = extractLocalImages(markdown, '/test');

      assert.strictEqual(images.length, 2);
      assert.strictEqual(images[0].markdownPath, './img1.png');
      assert.strictEqual(images[1].markdownPath, './img2.jpg');
    });

    it('ignores external URLs', () => {
      const markdown = '![External](https://example.com/image.png)';
      const images = extractLocalImages(markdown, '/test');

      assert.strictEqual(images.length, 0);
    });

    it('ignores http URLs', () => {
      const markdown = '![External](http://example.com/image.png)';
      const images = extractLocalImages(markdown, '/test');

      assert.strictEqual(images.length, 0);
    });

    it('ignores data URIs', () => {
      const markdown = '![Inline](data:image/png;base64,abc123)';
      const images = extractLocalImages(markdown, '/test');

      assert.strictEqual(images.length, 0);
    });

    it('handles empty alt text', () => {
      const markdown = '![](./image.jpg)';
      const images = extractLocalImages(markdown, '/test');

      assert.strictEqual(images.length, 1);
      assert.strictEqual(images[0].altText, '');
    });

    it('resolves absolute paths correctly', () => {
      const markdown = '![Test](./slug/image.jpg)';
      const images = extractLocalImages(markdown, '/content/articles');

      assert.strictEqual(images[0].absolutePath, '/content/articles/slug/image.jpg');
    });
  });

  describe('escapeRegex', () => {
    it('escapes special regex characters', () => {
      const input = './path[1]/file.jpg';
      const escaped = escapeRegex(input);

      assert.strictEqual(escaped, '\\.\/path\\[1\\]\/file\\.jpg');
    });

    it('handles string without special characters', () => {
      const input = 'simple-path';
      const escaped = escapeRegex(input);

      assert.strictEqual(escaped, 'simple-path');
    });
  });

  describe('rewriteImageUrls', () => {
    it('rewrites local paths to WordPress URLs', () => {
      const html = '<img src="./images/photo.jpg" alt="Photo">';
      const urlMap = {
        './images/photo.jpg': 'https://example.com/wp-content/uploads/photo.jpg'
      };

      const result = rewriteImageUrls(html, urlMap);

      assert.strictEqual(
        result,
        '<img src="https://example.com/wp-content/uploads/photo.jpg" alt="Photo">'
      );
    });

    it('rewrites multiple occurrences', () => {
      const html = '<img src="./img.jpg"><img src="./img.jpg">';
      const urlMap = { './img.jpg': 'https://wp.com/img.jpg' };

      const result = rewriteImageUrls(html, urlMap);

      assert.ok(result.includes('https://wp.com/img.jpg'));
      assert.ok(!result.includes('./img.jpg'));
    });

    it('handles multiple different images', () => {
      const html = '<img src="./a.jpg"><img src="./b.jpg">';
      const urlMap = {
        './a.jpg': 'https://wp.com/a.jpg',
        './b.jpg': 'https://wp.com/b.jpg'
      };

      const result = rewriteImageUrls(html, urlMap);

      assert.strictEqual(result, '<img src="https://wp.com/a.jpg"><img src="https://wp.com/b.jpg">');
    });
  });

  describe('getFileHash', () => {
    it('returns consistent hash for same content', () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'test content');

      const hash1 = getFileHash(filePath);
      const hash2 = getFileHash(filePath);

      assert.strictEqual(hash1, hash2);
    });

    it('returns different hash for different content', () => {
      const file1 = path.join(tempDir, 'test1.txt');
      const file2 = path.join(tempDir, 'test2.txt');
      fs.writeFileSync(file1, 'content 1');
      fs.writeFileSync(file2, 'content 2');

      const hash1 = getFileHash(file1);
      const hash2 = getFileHash(file2);

      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('getSidecarPath', () => {
    it('generates correct sidecar path', () => {
      const mdPath = '/content/articles/my-article.md';
      const sidecarPath = getSidecarPath(mdPath);

      assert.strictEqual(sidecarPath, '/content/articles/my-article.images.json');
    });
  });

  describe('loadSidecar and saveSidecar', () => {
    it('saves and loads sidecar data', () => {
      const mdPath = path.join(tempDir, 'article.md');
      const data = {
        site: 'example.com',
        uploaded: {
          './img.jpg': { mediaId: 123, url: 'https://example.com/img.jpg' }
        }
      };

      saveSidecar(mdPath, data);
      const loaded = loadSidecar(mdPath);

      assert.deepStrictEqual(loaded, data);
    });

    it('returns null for non-existent sidecar', () => {
      const mdPath = path.join(tempDir, 'nonexistent.md');
      const loaded = loadSidecar(mdPath);

      assert.strictEqual(loaded, null);
    });
  });

  describe('getImagesToUpload', () => {
    it('returns all images when no sidecar exists', () => {
      const images = [
        { markdownPath: './img1.jpg', absolutePath: '/path/img1.jpg' },
        { markdownPath: './img2.jpg', absolutePath: '/path/img2.jpg' }
      ];

      const toUpload = getImagesToUpload(images, null, 'site1');

      assert.strictEqual(toUpload.length, 2);
    });

    it('returns all images when sidecar is for different site', () => {
      const images = [{ markdownPath: './img.jpg', absolutePath: '/path/img.jpg' }];
      const sidecar = { site: 'other-site', uploaded: {} };

      const toUpload = getImagesToUpload(images, sidecar, 'my-site');

      assert.strictEqual(toUpload.length, 1);
    });

    it('skips images already in sidecar with matching hash', () => {
      const imgPath = path.join(tempDir, 'img.jpg');
      fs.writeFileSync(imgPath, 'image data');
      const hash = getFileHash(imgPath);

      const images = [{ markdownPath: './img.jpg', absolutePath: imgPath }];
      const sidecar = {
        site: 'my-site',
        uploaded: {
          './img.jpg': { mediaId: 123, hash }
        }
      };

      const toUpload = getImagesToUpload(images, sidecar, 'my-site');

      assert.strictEqual(toUpload.length, 0);
    });

    it('includes images with changed hash', () => {
      const imgPath = path.join(tempDir, 'img.jpg');
      fs.writeFileSync(imgPath, 'new image data');

      const images = [{ markdownPath: './img.jpg', absolutePath: imgPath }];
      const sidecar = {
        site: 'my-site',
        uploaded: {
          './img.jpg': { mediaId: 123, hash: 'old-hash' }
        }
      };

      const toUpload = getImagesToUpload(images, sidecar, 'my-site');

      assert.strictEqual(toUpload.length, 1);
    });
  });

  describe('buildUrlMapFromSidecar', () => {
    it('builds URL map from sidecar data', () => {
      const images = [
        { markdownPath: './img1.jpg' },
        { markdownPath: './img2.jpg' }
      ];
      const sidecar = {
        uploaded: {
          './img1.jpg': { url: 'https://wp.com/img1.jpg' },
          './img2.jpg': { url: 'https://wp.com/img2.jpg' }
        }
      };

      const urlMap = buildUrlMapFromSidecar(images, sidecar);

      assert.strictEqual(urlMap['./img1.jpg'], 'https://wp.com/img1.jpg');
      assert.strictEqual(urlMap['./img2.jpg'], 'https://wp.com/img2.jpg');
    });

    it('returns empty map when no sidecar', () => {
      const images = [{ markdownPath: './img.jpg' }];
      const urlMap = buildUrlMapFromSidecar(images, null);

      assert.deepStrictEqual(urlMap, {});
    });
  });

  describe('updateSidecar', () => {
    it('creates new sidecar with uploaded images', () => {
      const uploaded = [{
        localPath: './img.jpg',
        absolutePath: path.join(tempDir, 'img.jpg'),
        mediaId: 123,
        url: 'https://wp.com/img.jpg'
      }];

      // Create test file for hash
      fs.writeFileSync(path.join(tempDir, 'img.jpg'), 'test');

      const result = updateSidecar(null, 'my-site', uploaded);

      assert.strictEqual(result.site, 'my-site');
      assert.ok(result.uploaded['./img.jpg']);
      assert.strictEqual(result.uploaded['./img.jpg'].mediaId, 123);
      assert.strictEqual(result.uploaded['./img.jpg'].url, 'https://wp.com/img.jpg');
    });

    it('preserves existing uploaded images', () => {
      const existing = {
        site: 'my-site',
        uploaded: {
          './old.jpg': { mediaId: 100, url: 'https://wp.com/old.jpg' }
        }
      };
      const newUploads = [{
        localPath: './new.jpg',
        absolutePath: path.join(tempDir, 'new.jpg'),
        mediaId: 200,
        url: 'https://wp.com/new.jpg'
      }];

      fs.writeFileSync(path.join(tempDir, 'new.jpg'), 'test');

      const result = updateSidecar(existing, 'my-site', newUploads);

      assert.ok(result.uploaded['./old.jpg']);
      assert.ok(result.uploaded['./new.jpg']);
    });
  });

  describe('updateFrontMatterWithWordPress', () => {
    it('adds wordpress metadata to front matter', () => {
      const mdPath = path.join(tempDir, 'article.md');
      fs.writeFileSync(mdPath, `---
title: Test Article
slug: test-article
---

Content here.
`);

      updateFrontMatterWithWordPress(mdPath, {
        postId: 12345,
        slug: 'test-article',
        link: 'https://example.com/test-article/',
        categories: [1, 2],
        tags: [10, 20, 30]
      });

      const content = fs.readFileSync(mdPath, 'utf-8');

      assert.ok(content.includes('post_id: 12345'));
      // gray-matter may quote the URL
      assert.ok(
        content.includes('canonical_url: https://example.com/test-article/') ||
        content.includes("canonical_url: 'https://example.com/test-article/'")
      );
    });

    it('preserves existing front matter', () => {
      const mdPath = path.join(tempDir, 'article.md');
      fs.writeFileSync(mdPath, `---
title: My Title
author: Jane Doe
---

Content.
`);

      updateFrontMatterWithWordPress(mdPath, {
        postId: 999,
        slug: 'test',
        link: 'https://example.com/test/'
      });

      const content = fs.readFileSync(mdPath, 'utf-8');

      assert.ok(content.includes('title: My Title'));
      assert.ok(content.includes('author: Jane Doe'));
      assert.ok(content.includes('post_id: 999'));
    });
  });

  describe('readWordPressMetadata', () => {
    it('reads wordpress metadata from front matter', () => {
      const mdPath = path.join(tempDir, 'article.md');
      fs.writeFileSync(mdPath, `---
title: Test
wordpress:
  post_id: 12345
  category_ids:
    - 1
    - 2
---

Content.
`);

      const metadata = readWordPressMetadata(mdPath);

      assert.strictEqual(metadata.post_id, 12345);
      assert.deepStrictEqual(metadata.category_ids, [1, 2]);
    });

    it('returns null for file without wordpress metadata', () => {
      const mdPath = path.join(tempDir, 'article.md');
      fs.writeFileSync(mdPath, `---
title: Test
---

Content.
`);

      const metadata = readWordPressMetadata(mdPath);

      assert.strictEqual(metadata, null);
    });

    it('returns null for non-existent file', () => {
      const metadata = readWordPressMetadata('/nonexistent/file.md');

      assert.strictEqual(metadata, null);
    });
  });
});
