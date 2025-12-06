/**
 * Tests for fetch module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { extractSlugFromUrl } = require('../lib/fetch');

describe('extractSlugFromUrl', () => {
  it('extracts slug from /blog/YYYY/MM/DD/slug/ pattern', () => {
    const url = 'https://example.com/blog/2025/01/15/my-article/';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, 'my-article');
  });

  it('extracts slug from /YYYY/MM/DD/slug/ pattern', () => {
    const url = 'https://example.com/2025/01/15/another-article/';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, 'another-article');
  });

  it('extracts slug from simple /slug/ pattern', () => {
    const url = 'https://example.com/simple-page/';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, 'simple-page');
  });

  it('handles URLs without trailing slash', () => {
    const url = 'https://example.com/blog/2025/01/15/no-trailing-slash';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, 'no-trailing-slash');
  });

  it('handles complex slugs with hyphens and numbers', () => {
    const url = 'https://example.com/blog/2025/01/15/my-article-2024-v2/';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, 'my-article-2024-v2');
  });

  it('returns null for URLs with file extensions', () => {
    const url = 'https://example.com/page.html';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, null);
  });

  it('extracts from deeply nested blog paths', () => {
    const url = 'https://example.com/blog/2025/11/09/deep-nested-article/';
    const result = extractSlugFromUrl(url);
    assert.strictEqual(result, 'deep-nested-article');
  });
});
