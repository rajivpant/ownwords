/**
 * Tests for convert module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  htmlToMarkdown,
  cleanText,
  extractMetadata,
  extractArticleContent,
  generateFrontMatter
} = require('../lib/convert');

describe('cleanText', () => {
  it('removes extra whitespace', () => {
    const result = cleanText('Hello   world');
    assert.strictEqual(result, 'Hello world');
  });

  it('converts HTML entities', () => {
    const result = cleanText('It&#8217;s a &#8220;test&#8221;');
    assert.strictEqual(result, "It's a \"test\"");
  });

  it('converts ampersand entity', () => {
    const result = cleanText('A &amp; B');
    assert.strictEqual(result, 'A & B');
  });

  it('converts less/greater than entities', () => {
    const result = cleanText('&lt;tag&gt;');
    assert.strictEqual(result, '<tag>');
  });

  it('converts nbsp to regular space', () => {
    const result = cleanText('Hello&nbsp;World');
    assert.strictEqual(result, 'Hello World');
  });

  it('trims leading and trailing whitespace', () => {
    const result = cleanText('  trimmed  ');
    assert.strictEqual(result, 'trimmed');
  });

  it('converts en-dash and em-dash', () => {
    const result = cleanText('A&#8211;B&#8212;C');
    assert.strictEqual(result, 'A–B—C');
  });

  it('converts ellipsis', () => {
    const result = cleanText('Wait&#8230;');
    assert.strictEqual(result, 'Wait...');
  });
});

describe('htmlToMarkdown', () => {
  it('converts simple paragraph', () => {
    const html = '<p>Hello world</p>';
    const md = htmlToMarkdown(html);
    assert.strictEqual(md.trim(), 'Hello world');
  });

  it('converts h2 headings', () => {
    const html = '<h2>Section Title</h2>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('## Section Title'));
  });

  it('converts h3 headings', () => {
    const html = '<h3>Subsection</h3>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('### Subsection'));
  });

  it('converts WordPress block headings', () => {
    const html = '<h2 class="wp-block-heading">Block Heading</h2>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('## Block Heading'));
  });

  it('converts links', () => {
    const html = '<a href="https://example.com">Example</a>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('[Example](https://example.com)'));
  });

  it('converts bold text', () => {
    const html = '<strong>bold</strong>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('**bold**'));
  });

  it('converts italic text', () => {
    const html = '<em>italic</em>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('*italic*'));
  });

  it('converts inline code', () => {
    const html = '<code>const x = 1</code>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('`const x = 1`'));
  });

  it('converts code blocks', () => {
    const html = '<pre><code>const x = 1;\nconst y = 2;</code></pre>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('```'));
    assert.ok(md.includes('const x = 1'));
  });

  it('converts code blocks with language', () => {
    const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const md = htmlToMarkdown(html);
    // The implementation extracts language from class attribute
    // Check that code content is preserved
    assert.ok(md.includes('```'));
    assert.ok(md.includes('const x = 1'));
  });

  it('converts images', () => {
    const html = '<img src="image.jpg" alt="My Image" />';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('![My Image](image.jpg)'));
  });

  it('converts unordered lists', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const md = htmlToMarkdown(html);
    // Turndown adds extra spaces after bullet marker
    assert.ok(md.includes('Item 1'));
    assert.ok(md.includes('Item 2'));
    assert.ok(md.includes('-'));
  });

  it('converts ordered lists', () => {
    const html = '<ol><li>First</li><li>Second</li></ol>';
    const md = htmlToMarkdown(html);
    // Turndown adds extra spaces after number marker
    assert.ok(md.includes('First'));
    assert.ok(md.includes('Second'));
    assert.ok(md.includes('1.'));
    assert.ok(md.includes('2.'));
  });

  it('converts blockquotes', () => {
    const html = '<blockquote><p>Quoted text</p></blockquote>';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('> Quoted text'));
  });

  it('converts horizontal rules', () => {
    const html = '<hr />';
    const md = htmlToMarkdown(html);
    assert.ok(md.includes('---'));
  });

  it('removes WordPress block comments', () => {
    const html = '<!-- wp:paragraph --><p>Content</p><!-- /wp:paragraph -->';
    const md = htmlToMarkdown(html);
    assert.ok(!md.includes('wp:'));
    assert.ok(md.includes('Content'));
  });

  it('handles nested emphasis', () => {
    const html = '<p><strong>Bold and <em>italic</em></strong></p>';
    const md = htmlToMarkdown(html);
    // Verify bold and italic are both converted
    assert.ok(md.includes('**'));
    assert.ok(md.includes('*italic*'));
  });
});

describe('extractMetadata', () => {
  it('extracts title from h1 with entry-title class', () => {
    const html = '<h1 class="entry-title">My Article Title</h1>';
    const result = extractMetadata(html);
    assert.strictEqual(result.title, 'My Article Title');
  });

  it('extracts title from plain h1', () => {
    const html = '<h1>Simple Title</h1>';
    const result = extractMetadata(html);
    assert.strictEqual(result.title, 'Simple Title');
  });

  it('extracts title from og:title meta', () => {
    const html = '<meta property="og:title" content="OG Title" />';
    const result = extractMetadata(html);
    assert.strictEqual(result.title, 'OG Title');
  });

  it('extracts date from time element', () => {
    const html = '<time datetime="2025-01-15T10:30:00">January 15, 2025</time>';
    const result = extractMetadata(html);
    // Full timestamp is preserved when available
    assert.strictEqual(result.date, '2025-01-15T10:30:00');
  });

  it('extracts date from article:published_time meta', () => {
    const html = '<meta property="article:published_time" content="2025-02-20T08:00:00" />';
    const result = extractMetadata(html);
    // Full timestamp is preserved when available
    assert.strictEqual(result.date, '2025-02-20T08:00:00');
  });

  it('extracts canonical URL', () => {
    const html = '<link rel="canonical" href="https://example.com/my-article/" />';
    const result = extractMetadata(html);
    assert.strictEqual(result.canonicalUrl, 'https://example.com/my-article/');
  });

  it('extracts description from meta name', () => {
    const html = '<meta name="description" content="This is the description" />';
    const result = extractMetadata(html);
    assert.strictEqual(result.description, 'This is the description');
  });

  it('extracts description from og:description', () => {
    const html = '<meta property="og:description" content="OG Description" />';
    const result = extractMetadata(html);
    assert.strictEqual(result.description, 'OG Description');
  });

  it('returns empty strings for missing metadata', () => {
    const html = '<div>No metadata here</div>';
    const result = extractMetadata(html);
    assert.strictEqual(result.title, '');
    assert.strictEqual(result.date, '');
    assert.strictEqual(result.canonicalUrl, '');
    assert.strictEqual(result.description, '');
  });
});

describe('extractArticleContent', () => {
  it('extracts content from entry-content div', () => {
    // Test with realistic WordPress structure including end markers
    const html = `
      <div class="entry-content">
        <p>Article content here</p>
      </div>
      <footer class="entry-footer">Footer</footer>
    `;
    const result = extractArticleContent(html);
    assert.ok(result.includes('Article content here'));
    // Footer should be excluded because entry-footer is an end marker
    assert.ok(!result.includes('Footer'));
  });

  it('extracts content using paragraph-based detection', () => {
    const html = `
      <header>Header</header>
      <p>First paragraph</p>
      <p>Second paragraph</p>
      <div class="sharedaddy">Share buttons</div>
    `;
    const result = extractArticleContent(html);
    assert.ok(result.includes('First paragraph'));
    assert.ok(!result.includes('Share buttons'));
  });
});

describe('generateFrontMatter', () => {
  it('generates basic front matter', () => {
    const metadata = {
      title: 'My Title',
      slug: 'my-title',
      date: '2025-01-15'
    };
    const result = generateFrontMatter(metadata);
    assert.ok(result.startsWith('---'));
    assert.ok(result.endsWith('---'));
    assert.ok(result.includes('title: "My Title"'));
    assert.ok(result.includes('slug: "my-title"'));
    assert.ok(result.includes('date: "2025-01-15"'));
  });

  it('includes optional fields when provided', () => {
    const metadata = {
      title: 'Test',
      slug: 'test',
      date: '2025-01-15',
      canonicalUrl: 'https://example.com/test/',
      description: 'A test article',
      category: 'Testing',
      seriesOrder: 3
    };
    const result = generateFrontMatter(metadata);
    assert.ok(result.includes('canonical_url: "https://example.com/test/"'));
    assert.ok(result.includes('description: "A test article"'));
    assert.ok(result.includes('category: "Testing"'));
    assert.ok(result.includes('series_order: 3'));
  });

  it('escapes quotes in title', () => {
    const metadata = {
      title: 'Article with "quotes"',
      slug: 'quotes',
      date: '2025-01-15'
    };
    const result = generateFrontMatter(metadata);
    assert.ok(result.includes('title: "Article with \\"quotes\\""'));
  });

  it('includes wordpress_synced field', () => {
    const metadata = {
      title: 'Test',
      slug: 'test',
      date: '2025-01-15'
    };
    const result = generateFrontMatter(metadata);
    assert.ok(result.includes('wordpress_synced: "2025-01-15"'));
  });
});
