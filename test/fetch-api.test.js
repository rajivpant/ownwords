/**
 * @fileoverview Tests for fetch-api module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  extractSlugFromUrl,
  extractDomain,
  findSiteByDomain,
  generateEnrichedFrontMatter
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
    assert.strictEqual(normalized.date, '2025-01-15');
    assert.strictEqual(normalized.modified, '2025-01-16');
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
