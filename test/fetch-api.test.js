/**
 * @fileoverview Tests for fetch-api module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  extractSlugFromUrl,
  extractDomain,
  findSiteByDomain,
  generateEnrichedFrontMatter,
  generateDatePrefixedFilename,
  generateHierarchicalPath,
  normalizeWordPressImageUrl,
  rewriteImageUrls,
  getImageBaseKey
} = require('../lib/fetch-api');

describe('extractSlugFromUrl', () => {
  it('extracts slug from /blog/YYYY/MM/DD/slug/ pattern', () => {
    const slug = extractSlugFromUrl('https://example.com/blog/2025/01/15/my-article/');
    assert.strictEqual(slug, 'my-article');
  });

  it('extracts slug from /YYYY/MM/slug/ pattern', () => {
    const slug = extractSlugFromUrl('https://example.com/2025/01/my-article/');
    assert.strictEqual(slug, 'my-article');
  });

  it('extracts slug from simple /slug/ pattern', () => {
    const slug = extractSlugFromUrl('https://example.com/my-article/');
    assert.strictEqual(slug, 'my-article');
  });

  it('handles URLs without trailing slash', () => {
    const slug = extractSlugFromUrl('https://example.com/my-article');
    assert.strictEqual(slug, 'my-article');
  });

  it('handles plain slugs without URL structure', () => {
    const slug = extractSlugFromUrl('my-article');
    assert.strictEqual(slug, 'my-article');
  });

  it('handles empty trailing path', () => {
    const slug = extractSlugFromUrl('https://example.com/');
    assert.strictEqual(slug, '');
  });
});

describe('generateDatePrefixedFilename', () => {
  it('generates date-prefixed filename from ISO date string', () => {
    const result = generateDatePrefixedFilename('my-article', '2025-01-15');
    assert.strictEqual(result, '2025-01-15-my-article');
  });

  it('generates date-prefixed filename from full ISO datetime', () => {
    const result = generateDatePrefixedFilename('my-article', '2025-12-07T15:30:00');
    assert.strictEqual(result, '2025-12-07-my-article');
  });

  it('generates date-prefixed filename from ISO datetime with timezone', () => {
    const result = generateDatePrefixedFilename('my-article', '2025-12-07T15:30:00Z');
    assert.strictEqual(result, '2025-12-07-my-article');
  });

  it('uses current date when date is null', () => {
    const result = generateDatePrefixedFilename('my-article', null);
    const today = new Date().toISOString().substring(0, 10);
    assert.strictEqual(result, `${today}-my-article`);
  });

  it('uses current date when date is undefined', () => {
    const result = generateDatePrefixedFilename('my-article', undefined);
    const today = new Date().toISOString().substring(0, 10);
    assert.strictEqual(result, `${today}-my-article`);
  });

  it('handles slugs with numbers and hyphens', () => {
    const result = generateDatePrefixedFilename('my-article-2024-v2', '2025-01-15');
    assert.strictEqual(result, '2025-01-15-my-article-2024-v2');
  });
});

describe('extractDomain', () => {
  it('extracts domain from URL', () => {
    const domain = extractDomain('https://example.com/blog/article/');
    assert.strictEqual(domain, 'example.com');
  });

  it('extracts domain with subdomain', () => {
    const domain = extractDomain('https://blog.example.com/article/');
    assert.strictEqual(domain, 'blog.example.com');
  });

  it('extracts domain with www', () => {
    const domain = extractDomain('https://www.example.com/article/');
    assert.strictEqual(domain, 'www.example.com');
  });

  it('returns empty string for invalid URL', () => {
    const domain = extractDomain('not-a-url');
    assert.strictEqual(domain, '');
  });
});

describe('generateEnrichedFrontMatter', () => {
  it('generates basic front matter with title, slug, date', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'Test Article',
      date: '2025-01-15',
      modified: '2025-01-16',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: 'John Doe', slug: 'john' },
      categories: [],
      tags: [],
      featuredImage: null
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    assert.ok(frontMatter.includes('---'));
    assert.ok(frontMatter.includes('title: "Test Article"'));
    assert.ok(frontMatter.includes('slug: "test-article"'));
    assert.ok(frontMatter.includes('date: "2025-01-15"'));
    assert.ok(frontMatter.includes('modified: "2025-01-16"'));
    assert.ok(frontMatter.includes('canonical_url: "https://example.com/test-article/"'));
    assert.ok(frontMatter.includes('author: "John Doe"'));
    assert.ok(frontMatter.includes('post_id: 123'));
  });

  it('includes categories when present', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'Test Article',
      date: '2025-01-15',
      modified: '2025-01-15',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: 'John Doe', slug: 'john' },
      categories: [
        { id: 5, name: 'Programming', slug: 'programming' },
        { id: 7, name: 'JavaScript', slug: 'javascript' }
      ],
      tags: [],
      featuredImage: null
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    assert.ok(frontMatter.includes('categories:'));
    assert.ok(frontMatter.includes('- "Programming"'));
    assert.ok(frontMatter.includes('- "JavaScript"'));
    assert.ok(frontMatter.includes('category_ids: [5, 7]'));
  });

  it('includes tags when present', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'Test Article',
      date: '2025-01-15',
      modified: '2025-01-15',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: 'John Doe', slug: 'john' },
      categories: [],
      tags: [
        { id: 10, name: 'ai', slug: 'ai' },
        { id: 11, name: 'machine-learning', slug: 'machine-learning' }
      ],
      featuredImage: null
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    assert.ok(frontMatter.includes('tags:'));
    assert.ok(frontMatter.includes('- "ai"'));
    assert.ok(frontMatter.includes('- "machine-learning"'));
    assert.ok(frontMatter.includes('tag_ids: [10, 11]'));
  });

  it('includes featured image when present', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'Test Article',
      date: '2025-01-15',
      modified: '2025-01-15',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: 'John Doe', slug: 'john' },
      categories: [],
      tags: [],
      featuredImage: {
        id: 456,
        url: 'https://example.com/uploads/image.jpg',
        alt: 'A test image',
        title: 'Test Image',
        width: 1200,
        height: 800
      }
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    assert.ok(frontMatter.includes('featured_image: "https://example.com/uploads/image.jpg"'));
    assert.ok(frontMatter.includes('featured_image_alt: "A test image"'));
  });

  it('escapes quotes in title', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'The "Best" Article',
      date: '2025-01-15',
      modified: '2025-01-15',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: 'John Doe', slug: 'john' },
      categories: [],
      tags: [],
      featuredImage: null
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    assert.ok(frontMatter.includes('title: "The \\"Best\\" Article"'));
  });

  it('does not include modified when same as date', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'Test Article',
      date: '2025-01-15',
      modified: '2025-01-15',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: '', slug: '' },
      categories: [],
      tags: [],
      featuredImage: null
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    // modified should NOT appear when same as date
    const lines = frontMatter.split('\n');
    const modifiedLines = lines.filter(l => l.startsWith('modified:'));
    assert.strictEqual(modifiedLines.length, 0);
  });

  it('includes synced_at timestamp', () => {
    const normalized = {
      id: 123,
      slug: 'test-article',
      title: 'Test Article',
      date: '2025-01-15',
      modified: '2025-01-15',
      link: 'https://example.com/test-article/',
      excerpt: '',
      author: { id: 1, name: 'John Doe', slug: 'john' },
      categories: [],
      tags: [],
      featuredImage: null
    };

    const frontMatter = generateEnrichedFrontMatter(normalized);

    assert.ok(frontMatter.includes('synced_at:'));
  });
});


describe('generateHierarchicalPath', () => {
  it('generates posts path with date hierarchy', () => {
    const result = generateHierarchicalPath('posts', 'my-article', '2025-12-07');
    // Should be posts/2025/12/07-my-article
    assert.ok(result.includes('posts'));
    assert.ok(result.includes('2025'));
    assert.ok(result.includes('12'));
    assert.ok(result.includes('07-my-article'));
  });

  it('generates posts path from full ISO datetime', () => {
    const result = generateHierarchicalPath('posts', 'my-article', '2025-01-15T10:30:00Z');
    assert.ok(result.includes('posts'));
    assert.ok(result.includes('2025'));
    assert.ok(result.includes('01'));
    assert.ok(result.includes('15-my-article'));
  });

  it('uses current date when date is null for posts', () => {
    const result = generateHierarchicalPath('posts', 'my-article', null);
    const today = new Date();
    const year = today.getFullYear().toString();
    assert.ok(result.includes('posts'));
    assert.ok(result.includes(year));
  });

  it('generates simple pages path without dates', () => {
    const result = generateHierarchicalPath('pages', 'about', null);
    assert.ok(result.includes('pages'));
    assert.ok(result.includes('about'));
    assert.ok(!result.includes('2025')); // No date components
  });

  it('generates hierarchical pages path with parent', () => {
    const result = generateHierarchicalPath('pages', 'pricing', null, 'services');
    assert.ok(result.includes('pages'));
    assert.ok(result.includes('services'));
    assert.ok(result.includes('pricing'));
  });

  it('handles page without parent slug', () => {
    const result = generateHierarchicalPath('pages', 'contact', '2025-01-15');
    // Pages should NOT include date even if provided
    assert.ok(result.includes('pages'));
    assert.ok(result.includes('contact'));
    assert.ok(!result.includes('2025'));
    assert.ok(!result.includes('01'));
  });

  it('handles slugs with special characters', () => {
    const result = generateHierarchicalPath('posts', 'my-article-2024-v2', '2025-03-20');
    assert.ok(result.includes('posts'));
    assert.ok(result.includes('2025'));
    assert.ok(result.includes('03'));
    assert.ok(result.includes('20-my-article-2024-v2'));
  });
});

describe('WpClient embed methods', () => {
  const { WpClient } = require('../lib/wp-api');

  it('has getPostBySlugWithEmbed method', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    assert.strictEqual(typeof client.getPostBySlugWithEmbed, 'function');
  });

  it('has getPostByIdWithEmbed method', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    assert.strictEqual(typeof client.getPostByIdWithEmbed, 'function');
  });

  it('has normalizeEmbedResponse method', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    assert.strictEqual(typeof client.normalizeEmbedResponse, 'function');
  });

  it('normalizeEmbedResponse extracts basic fields', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    const post = {
      id: 123,
      slug: 'test-post',
      title: { rendered: 'Test Post' },
      content: { rendered: '<p>Content here</p>' },
      excerpt: { rendered: 'Summary' },
      date: '2025-01-15T10:30:00',
      date_gmt: '2025-01-15T15:30:00',
      modified: '2025-01-16T11:00:00',
      modified_gmt: '2025-01-16T16:00:00',
      status: 'publish',
      type: 'post',
      link: 'https://example.com/test-post/',
      format: 'standard',
      meta: {},
      _embedded: {}
    };

    const normalized = client.normalizeEmbedResponse(post);

    assert.strictEqual(normalized.id, 123);
    assert.strictEqual(normalized.slug, 'test-post');
    assert.strictEqual(normalized.title, 'Test Post');
    assert.strictEqual(normalized.content, '<p>Content here</p>');
    // Full timestamps are now preserved (not truncated to date-only)
    assert.strictEqual(normalized.date, '2025-01-15T10:30:00');
    assert.strictEqual(normalized.modified, '2025-01-16T11:00:00');
    assert.strictEqual(normalized.status, 'publish');
    assert.strictEqual(normalized.link, 'https://example.com/test-post/');
  });

  it('normalizeEmbedResponse extracts author', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    const post = {
      id: 123,
      slug: 'test-post',
      title: { rendered: 'Test' },
      content: { rendered: '' },
      excerpt: { rendered: '' },
      date: '2025-01-15T10:30:00',
      status: 'publish',
      type: 'post',
      link: 'https://example.com/test-post/',
      _embedded: {
        author: [{
          id: 1,
          name: 'John Doe',
          slug: 'john',
          avatar_urls: { '96': 'https://example.com/avatar.jpg' }
        }]
      }
    };

    const normalized = client.normalizeEmbedResponse(post);

    assert.strictEqual(normalized.author.id, 1);
    assert.strictEqual(normalized.author.name, 'John Doe');
    assert.strictEqual(normalized.author.slug, 'john');
    assert.strictEqual(normalized.author.avatar, 'https://example.com/avatar.jpg');
  });

  it('normalizeEmbedResponse extracts categories and tags', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    const post = {
      id: 123,
      slug: 'test-post',
      title: { rendered: 'Test' },
      content: { rendered: '' },
      excerpt: { rendered: '' },
      date: '2025-01-15T10:30:00',
      status: 'publish',
      type: 'post',
      link: 'https://example.com/test-post/',
      _embedded: {
        'wp:term': [
          [
            { id: 5, name: 'Programming', slug: 'programming', taxonomy: 'category' }
          ],
          [
            { id: 10, name: 'ai', slug: 'ai', taxonomy: 'post_tag' },
            { id: 11, name: 'ml', slug: 'ml', taxonomy: 'post_tag' }
          ]
        ]
      }
    };

    const normalized = client.normalizeEmbedResponse(post);

    assert.strictEqual(normalized.categories.length, 1);
    assert.strictEqual(normalized.categories[0].name, 'Programming');

    assert.strictEqual(normalized.tags.length, 2);
    assert.strictEqual(normalized.tags[0].name, 'ai');
    assert.strictEqual(normalized.tags[1].name, 'ml');
  });

  it('normalizeEmbedResponse extracts featured image', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    const post = {
      id: 123,
      slug: 'test-post',
      title: { rendered: 'Test' },
      content: { rendered: '' },
      excerpt: { rendered: '' },
      date: '2025-01-15T10:30:00',
      status: 'publish',
      type: 'post',
      link: 'https://example.com/test-post/',
      _embedded: {
        'wp:featuredmedia': [{
          id: 456,
          source_url: 'https://example.com/image.jpg',
          alt_text: 'Test image',
          title: { rendered: 'Image Title' },
          media_details: {
            width: 1200,
            height: 800,
            sizes: {
              full: { source_url: 'https://example.com/full-image.jpg' }
            }
          }
        }]
      }
    };

    const normalized = client.normalizeEmbedResponse(post);

    assert.ok(normalized.featuredImage);
    assert.strictEqual(normalized.featuredImage.id, 456);
    assert.strictEqual(normalized.featuredImage.url, 'https://example.com/full-image.jpg');
    assert.strictEqual(normalized.featuredImage.alt, 'Test image');
    assert.strictEqual(normalized.featuredImage.width, 1200);
  });

  it('normalizeEmbedResponse returns null for null input', () => {
    const client = new WpClient({
      url: 'https://example.com',
      username: 'test',
      appPassword: 'test123'
    });

    const result = client.normalizeEmbedResponse(null);
    assert.strictEqual(result, null);
  });
});

describe('normalizeWordPressImageUrl', () => {
  it('converts Jetpack CDN URL to direct WordPress URL', () => {
    const cdnUrl = 'https://i0.wp.com/rajiv.com/wp-content/uploads/2023/10/image.png?resize=1024x768';
    const siteUrl = 'https://rajiv.com';
    const result = normalizeWordPressImageUrl(cdnUrl, siteUrl);
    assert.strictEqual(result, 'https://rajiv.com/wp-content/uploads/2023/10/image.png');
  });

  it('handles i1.wp.com CDN variant', () => {
    const cdnUrl = 'https://i1.wp.com/example.com/wp-content/uploads/2024/05/photo.jpg?w=800';
    const siteUrl = 'https://example.com';
    const result = normalizeWordPressImageUrl(cdnUrl, siteUrl);
    assert.strictEqual(result, 'https://example.com/wp-content/uploads/2024/05/photo.jpg');
  });

  it('handles i2.wp.com CDN variant', () => {
    const cdnUrl = 'https://i2.wp.com/mysite.org/wp-content/uploads/image.webp?fit=600x400';
    const siteUrl = 'https://mysite.org';
    const result = normalizeWordPressImageUrl(cdnUrl, siteUrl);
    assert.strictEqual(result, 'https://mysite.org/wp-content/uploads/image.webp');
  });

  it('returns direct WordPress URL unchanged (strips query params)', () => {
    const directUrl = 'https://rajiv.com/wp-content/uploads/2023/10/image.png?ver=1.0';
    const siteUrl = 'https://rajiv.com';
    const result = normalizeWordPressImageUrl(directUrl, siteUrl);
    assert.strictEqual(result, 'https://rajiv.com/wp-content/uploads/2023/10/image.png');
  });

  it('returns URL unchanged for non-CDN external URLs', () => {
    const externalUrl = 'https://cdn.example.com/images/photo.jpg';
    const siteUrl = 'https://rajiv.com';
    const result = normalizeWordPressImageUrl(externalUrl, siteUrl);
    assert.strictEqual(result, 'https://cdn.example.com/images/photo.jpg');
  });

  it('handles URLs with complex query parameters', () => {
    const cdnUrl = 'https://i0.wp.com/rajiv.com/wp-content/uploads/2023/10/image.png?resize=1024%2C768&ssl=1';
    const siteUrl = 'https://rajiv.com';
    const result = normalizeWordPressImageUrl(cdnUrl, siteUrl);
    assert.strictEqual(result, 'https://rajiv.com/wp-content/uploads/2023/10/image.png');
  });

  it('handles deeply nested WordPress paths', () => {
    const cdnUrl = 'https://i0.wp.com/blog.example.com/wp-content/uploads/sites/2/2024/01/15/deep/path/image.png';
    const siteUrl = 'https://blog.example.com';
    const result = normalizeWordPressImageUrl(cdnUrl, siteUrl);
    assert.strictEqual(result, 'https://blog.example.com/wp-content/uploads/sites/2/2024/01/15/deep/path/image.png');
  });

  it('returns original URL for invalid URL input', () => {
    const invalidUrl = 'not-a-valid-url';
    const siteUrl = 'https://rajiv.com';
    const result = normalizeWordPressImageUrl(invalidUrl, siteUrl);
    assert.strictEqual(result, 'not-a-valid-url');
  });

  it('handles URLs without query params', () => {
    const cdnUrl = 'https://i0.wp.com/rajiv.com/wp-content/uploads/2023/10/image.png';
    const siteUrl = 'https://rajiv.com';
    const result = normalizeWordPressImageUrl(cdnUrl, siteUrl);
    assert.strictEqual(result, 'https://rajiv.com/wp-content/uploads/2023/10/image.png');
  });
});

describe('getImageBaseKey', () => {
  it('extracts base key from simple URL (includes origin)', () => {
    const url = 'https://example.com/wp-content/uploads/2024/01/image.jpg';
    const baseKey = getImageBaseKey(url);
    assert.strictEqual(baseKey, 'https://example.com/wp-content/uploads/2024/01/image.jpg');
  });

  it('strips query parameters from URL', () => {
    const url = 'https://example.com/wp-content/uploads/2024/01/image.jpg?resize=800x600';
    const baseKey = getImageBaseKey(url);
    assert.strictEqual(baseKey, 'https://example.com/wp-content/uploads/2024/01/image.jpg');
  });

  it('strips WordPress size suffixes like -1024x768', () => {
    const url = 'https://example.com/wp-content/uploads/2024/01/image-1024x768.jpg';
    const baseKey = getImageBaseKey(url);
    assert.strictEqual(baseKey, 'https://example.com/wp-content/uploads/2024/01/image.jpg');
  });

  it('strips WordPress -scaled suffix', () => {
    const url = 'https://example.com/wp-content/uploads/2024/01/image-scaled.jpg';
    const baseKey = getImageBaseKey(url);
    assert.strictEqual(baseKey, 'https://example.com/wp-content/uploads/2024/01/image.jpg');
  });

  it('handles Jetpack CDN URLs', () => {
    const url = 'https://i0.wp.com/example.com/wp-content/uploads/2024/01/image.jpg?resize=800';
    const baseKey = getImageBaseKey(url);
    // Jetpack CDN URL - the origin becomes i0.wp.com
    assert.ok(baseKey.includes('/example.com/wp-content/uploads/2024/01/image.jpg'));
  });

  it('handles multiple size patterns in same URL', () => {
    const url = 'https://example.com/wp-content/uploads/2024/01/my-photo-2024-300x200.png';
    const baseKey = getImageBaseKey(url);
    assert.strictEqual(baseKey, 'https://example.com/wp-content/uploads/2024/01/my-photo-2024.png');
  });
});

describe('rewriteImageUrls', () => {
  it('rewrites markdown image syntax ![alt](url)', () => {
    const markdown = '![My Photo](https://example.com/wp-content/uploads/2024/01/photo.jpg)';
    const urlMap = {
      'https://example.com/wp-content/uploads/2024/01/photo.jpg': 'photo.jpg'
    };
    const result = rewriteImageUrls(markdown, urlMap);
    assert.strictEqual(result, '![My Photo](./photo.jpg)');
  });

  it('rewrites multiple images in markdown', () => {
    const markdown = `![First](https://example.com/uploads/a.jpg)

Some text

![Second](https://example.com/uploads/b.jpg)`;
    const urlMap = {
      'https://example.com/uploads/a.jpg': 'a.jpg',
      'https://example.com/uploads/b.jpg': 'b.jpg'
    };
    const result = rewriteImageUrls(markdown, urlMap);
    assert.ok(result.includes('![First](./a.jpg)'));
    assert.ok(result.includes('![Second](./b.jpg)'));
  });

  it('rewrites HTML img src attributes', () => {
    const html = '<img src="https://example.com/uploads/photo.jpg" alt="Photo">';
    const urlMap = {
      'https://example.com/uploads/photo.jpg': 'photo.jpg'
    };
    const result = rewriteImageUrls(html, urlMap);
    assert.strictEqual(result, '<img src="./photo.jpg" alt="Photo">');
  });

  it('rewrites featured_image in YAML front matter', () => {
    const frontMatter = `---
title: "My Article"
featured_image: "https://example.com/wp-content/uploads/2024/01/featured.jpg"
featured_image_alt: "A beautiful image"
---`;
    const urlMap = {
      'https://example.com/wp-content/uploads/2024/01/featured.jpg': 'featured.jpg'
    };
    const result = rewriteImageUrls(frontMatter, urlMap);
    assert.ok(result.includes('featured_image: "./featured.jpg"'));
    // featured_image_alt should NOT be changed (it's not a URL)
    assert.ok(result.includes('featured_image_alt: "A beautiful image"'));
  });

  it('rewrites featured_image with size variants', () => {
    const frontMatter = `---
featured_image: "https://example.com/wp-content/uploads/2024/01/image-1024x768.jpg"
---`;
    const urlMap = {
      'https://example.com/wp-content/uploads/2024/01/image.jpg': 'image.jpg'
    };
    const result = rewriteImageUrls(frontMatter, urlMap);
    // Should match by base key, not exact URL
    assert.ok(result.includes('featured_image: "./image.jpg"'));
  });

  it('rewrites linked images [![alt](img)](link)', () => {
    const markdown = '[![Thumbnail](https://example.com/thumb-300x200.jpg)](https://example.com/full.jpg)';
    const urlMap = {
      'https://example.com/thumb.jpg': 'thumb.jpg',
      'https://example.com/full.jpg': 'full.jpg'
    };
    const result = rewriteImageUrls(markdown, urlMap);
    assert.ok(result.includes('./thumb.jpg'));
    assert.ok(result.includes('./full.jpg'));
  });

  it('does not rewrite non-image URLs in links', () => {
    const markdown = '[Read more](https://example.com/article/)';
    const urlMap = {
      'https://example.com/image.jpg': 'image.jpg'
    };
    const result = rewriteImageUrls(markdown, urlMap);
    // Link should remain unchanged
    assert.strictEqual(result, markdown);
  });

  it('handles empty urlMap gracefully', () => {
    const markdown = '![Photo](https://example.com/photo.jpg)';
    const result = rewriteImageUrls(markdown, {});
    assert.strictEqual(result, markdown);
  });

  it('preserves image alt text during rewrite', () => {
    const markdown = '![A beautiful sunset over the ocean](https://example.com/sunset.jpg)';
    const urlMap = {
      'https://example.com/sunset.jpg': 'sunset.jpg'
    };
    const result = rewriteImageUrls(markdown, urlMap);
    assert.strictEqual(result, '![A beautiful sunset over the ocean](./sunset.jpg)');
  });
});
