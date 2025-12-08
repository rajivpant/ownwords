/**
 * Tests for fetch module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { extractSlugFromUrl, extractDateFromUrl } = require('../lib/fetch');

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

describe('extractDateFromUrl', () => {
  it('extracts date from /blog/YYYY/MM/DD/slug/ pattern', () => {
    const url = 'https://example.com/blog/2025/01/15/my-article/';
    const result = extractDateFromUrl(url);
    assert.strictEqual(result, '2025-01-15');
  });

  it('extracts date from /YYYY/MM/DD/slug/ pattern', () => {
    const url = 'https://example.com/2025/11/09/another-article/';
    const result = extractDateFromUrl(url);
    assert.strictEqual(result, '2025-11-09');
  });

  it('returns null for simple /slug/ pattern (no date in URL)', () => {
    const url = 'https://example.com/simple-page/';
    const result = extractDateFromUrl(url);
    assert.strictEqual(result, null);
  });

  it('returns null for URLs without date structure', () => {
    const url = 'https://example.com/category/my-article/';
    const result = extractDateFromUrl(url);
    assert.strictEqual(result, null);
  });

  it('handles URLs without trailing slash', () => {
    const url = 'https://example.com/blog/2025/12/07/no-trailing-slash';
    const result = extractDateFromUrl(url);
    assert.strictEqual(result, '2025-12-07');
  });

  it('returns null for p=123 style permalinks', () => {
    const url = 'https://example.com/?p=123';
    const result = extractDateFromUrl(url);
    assert.strictEqual(result, null);
  });
});
