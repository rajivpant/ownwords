/**
 * @fileoverview WordPress HTML to Markdown conversion
 * @module ownwords/convert
 *
 * Uses Turndown (https://github.com/mixmark-io/turndown) for HTML to Markdown
 * conversion with the GFM plugin for tables and other GitHub Flavored Markdown.
 */

const fs = require('fs');
const path = require('path');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

// Create and configure turndown service
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined'
});

// Add GFM support (tables, strikethrough, task lists)
turndownService.use(gfm);

// Custom rule to handle WordPress block code with language hints
turndownService.addRule('wordpressCodeBlock', {
  filter: function (node) {
    return (
      node.nodeName === 'PRE' &&
      node.classList &&
      (node.classList.contains('wp-block-code') ||
       node.classList.contains('wp-block-preformatted'))
    );
  },
  replacement: function (content, node) {
    // Try to extract language from code element's class
    const codeEl = node.querySelector('code');
    let language = '';
    if (codeEl && codeEl.className) {
      const langMatch = codeEl.className.match(/language-(\w+)/);
      if (langMatch) {
        language = langMatch[1];
      }
    }
    // Get text content and clean it
    const code = (codeEl || node).textContent || '';
    return '\n\n```' + language + '\n' + code.trim() + '\n```\n\n';
  }
});

// Keep figure/figcaption handling clean
turndownService.addRule('figure', {
  filter: 'figure',
  replacement: function (content) {
    return '\n\n' + content.trim() + '\n\n';
  }
});

turndownService.addRule('figcaption', {
  filter: 'figcaption',
  replacement: function (content) {
    return '*' + content.trim() + '*\n';
  }
});

/**
 * Extract article content from WordPress HTML
 *
 * Handles multiple WordPress theme patterns including:
 * - entry-content div (common theme pattern)
 * - WordPress block editor patterns
 * - Paragraph-based detection (WordPress.com/Jetpack)
 *
 * @param {string} html - The full WordPress page HTML
 * @returns {string} The extracted article content HTML
 */
function extractArticleContent(html) {
  let content = html;

  // Method 1: Try entry-content div (common WordPress theme pattern)
  // Use a greedy match to get all content within the entry-content div
  const entryMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*)/i);
  if (entryMatch) {
    content = entryMatch[1];

    // Find where the article content ends by looking for common end markers
    const endMarkers = [
      /<div[^>]*class="[^"]*sharedaddy[^"]*"/i,
      /<div[^>]*class="[^"]*jp-relatedposts[^"]*"/i,
      /<div[^>]*class="[^"]*wp-block-jetpack-sharing-buttons[^"]*"/i,
      /### Share this:/i,
      /<h3[^>]*>Share this:/i,
      /<footer[^>]*class="[^"]*entry-footer[^"]*"/i,
      /<nav[^>]*class="[^"]*post-navigation[^"]*"/i,
      /<div[^>]*class="[^"]*wp-block-comments[^"]*"/i,
      /<div[^>]*id="comments"/i,
      /<!-- \.entry-content -->/i
    ];

    for (const marker of endMarkers) {
      const markerMatch = content.match(marker);
      if (markerMatch) {
        const idx = content.indexOf(markerMatch[0]);
        if (idx !== -1) {
          content = content.substring(0, idx);
          break;
        }
      }
    }
  } else {
    // Method 2: Find content between first <p> and sharing/comments (WordPress.com/Jetpack pattern)
    const contentStart = content.indexOf('<p>');
    if (contentStart !== -1) {
      let contentEnd = content.length;
      const endings = [
        content.indexOf('<div class="sharedaddy'),
        content.indexOf('<div class="wp-block-comments'),
        content.indexOf('class="post-navigation-link'),
        content.indexOf('<footer class="entry-footer'),
        content.indexOf('<nav class="post-navigation')
      ];

      for (const ending of endings) {
        if (ending !== -1) contentEnd = Math.min(contentEnd, ending);
      }

      content = content.substring(contentStart, contentEnd);
    }
  }

  return content;
}

/**
 * Extract metadata from WordPress HTML
 *
 * Extracts:
 * - title: From og:title, title tag, or h1.entry-title (in priority order)
 * - date: From time[datetime], article:published_time, or YYYY-MM-DD pattern
 * - canonicalUrl: From link[rel="canonical"]
 * - description: From meta[name="description"] or og:description
 *
 * @param {string} html - The full WordPress page HTML
 * @returns {Object} Extracted metadata
 * @returns {string} returns.title - Article title
 * @returns {string} returns.date - Publication date (YYYY-MM-DD)
 * @returns {string} returns.canonicalUrl - Canonical URL
 * @returns {string} returns.description - Meta description
 */
function extractMetadata(html) {
  // Extract title - priority order: og:title, title tag (cleaned), entry-title h1
  let title = '';

  // Try og:title first (cleanest source)
  const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                       html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i);
  if (ogTitleMatch) {
    title = cleanText(ogTitleMatch[1]);
  }

  // If no og:title, try the <title> tag and strip site name
  if (!title) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      let rawTitle = titleMatch[1];
      // Strip common site name separators: " – site.com", " | site.com", " - site.com"
      rawTitle = rawTitle.replace(/\s*[–||-]\s*[^–||-]+$/, '');
      title = cleanText(rawTitle);
    }
  }

  // Try h1 with entry-title class
  if (!title) {
    const h1Match = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      title = cleanText(h1Match[1]);
    }
  }

  // Last resort: try plain h1 (but avoid if it contains links/images which suggest it's a site logo)
  if (!title) {
    const plainH1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (plainH1Match) {
      title = cleanText(plainH1Match[1]);
    }
  }

  // Extract date - try multiple patterns
  let date = '';
  const datePatterns = [
    /<time[^>]*datetime="([^"]+)"/i,
    /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i,
    /(\d{4}-\d{2}-\d{2})/
  ];
  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    if (match) {
      date = match[1].substring(0, 10);
      break;
    }
  }

  // Extract canonical URL
  const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i) ||
                         html.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : '';

  // Extract meta description - look for og:description or meta description
  let description = '';
  const descPatterns = [
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i,
    /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*name="description"/i
  ];
  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match) {
      description = cleanText(match[1]);
      break;
    }
  }

  return { title, date, canonicalUrl, description };
}

/**
 * Clean text by removing HTML entities and normalizing whitespace
 *
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  return text
    // Curly quotes and apostrophes
    .replace(/&#8217;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    // Dashes
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    // Ellipsis
    .replace(/&#8230;/g, '...')
    .replace(/&hellip;/g, '...')
    // Brackets
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    // Basic entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    // Numeric entity fallback (handle any remaining &#NNN; or &#xHH; patterns)
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Normalize whitespace (but don't collapse multiple newlines)
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Convert HTML to Markdown using Turndown
 *
 * Uses the battle-tested Turndown library with GFM plugin for:
 * - Tables
 * - Strikethrough
 * - Task lists
 * - Code blocks with syntax highlighting
 *
 * @param {string} html - HTML content to convert
 * @returns {string} Converted Markdown
 */
function htmlToMarkdown(html) {
  // Remove WordPress block comments before conversion
  const cleanHtml = html.replace(/<!--\s*\/?wp:[^>]*-->/g, '');

  // Use turndown for conversion
  let md = turndownService.turndown(cleanHtml);

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, '\n\n');

  // Trim each line
  md = md.split('\n').map(line => line.trimEnd()).join('\n');

  return md.trim();
}

/**
 * Generate YAML front matter from metadata
 *
 * @param {Object} metadata - Article metadata
 * @param {string} metadata.title - Article title
 * @param {string} metadata.slug - URL slug
 * @param {string} metadata.date - Publication date
 * @param {string} [metadata.canonicalUrl] - Canonical URL
 * @param {string} [metadata.description] - Meta description
 * @param {string} [metadata.category] - Article category
 * @param {number} [metadata.seriesOrder] - Order in series
 * @returns {string} YAML front matter block
 */
function generateFrontMatter(metadata) {
  const lines = ['---'];

  if (metadata.title) {
    lines.push(`title: "${metadata.title.replace(/"/g, '\\"')}"`);
  }
  if (metadata.slug) {
    lines.push(`slug: "${metadata.slug}"`);
  }
  if (metadata.date) {
    lines.push(`date: "${metadata.date}"`);
  }
  if (metadata.canonicalUrl) {
    lines.push(`canonical_url: "${metadata.canonicalUrl}"`);
  }
  if (metadata.description) {
    lines.push(`description: "${metadata.description.replace(/"/g, '\\"')}"`);
  }
  if (metadata.category) {
    lines.push(`category: "${metadata.category}"`);
  }
  if (metadata.seriesOrder) {
    lines.push(`series_order: ${metadata.seriesOrder}`);
  }
  if (metadata.date) {
    lines.push(`wordpress_synced: "${metadata.date}"`);
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Convert a WordPress HTML file to Markdown
 *
 * @param {string} inputPath - Path to HTML file
 * @param {string} outputPath - Path for output Markdown file
 * @param {Object} [options] - Conversion options
 * @param {string} [options.slug] - Override the slug (default: derived from filename)
 * @param {string} [options.title] - Override the title
 * @param {string} [options.category] - Set the category
 * @param {number} [options.seriesOrder] - Set the series order
 * @param {string} [options.description] - Override the description
 * @param {string} [options.canonicalUrl] - Override the canonical URL
 * @param {string} [options.date] - Override the date
 * @param {boolean} [options.silent=false] - Suppress console output
 * @returns {Object} Conversion result
 * @returns {string} returns.title - Article title
 * @returns {string} returns.slug - Article slug
 * @returns {string} returns.date - Publication date
 * @returns {number} returns.wordCount - Word count of content
 * @returns {string} returns.markdown - The full markdown content
 *
 * @example
 * const result = convertFile('./raw/my-article.html', './content/my-article.md', {
 *   category: 'Core Series',
 *   seriesOrder: 1
 * });
 */
function convertFile(inputPath, outputPath, options = {}) {
  const { silent = false } = options;

  if (!silent) {
    console.log(`Converting: ${inputPath}`);
  }

  const html = fs.readFileSync(inputPath, 'utf-8');

  // Extract metadata from HTML
  const extracted = extractMetadata(html);

  // Extract and convert content
  const content = extractArticleContent(html);
  const markdown = htmlToMarkdown(content);

  // Determine slug from options or filename
  const slug = options.slug || path.basename(inputPath, '.html');

  // Merge extracted metadata with options (options override extracted)
  const metadata = {
    title: options.title || extracted.title,
    slug,
    date: options.date || extracted.date,
    canonicalUrl: options.canonicalUrl || extracted.canonicalUrl,
    description: options.description || extracted.description,
    category: options.category,
    seriesOrder: options.seriesOrder
  };

  const frontMatter = generateFrontMatter(metadata);
  const fullMarkdown = `${frontMatter}\n\n${markdown}\n`;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, fullMarkdown);

  if (!silent) {
    console.log(`  Saved: ${outputPath} (${(fullMarkdown.length / 1024).toFixed(1)} KB)`);
  }

  return {
    title: metadata.title,
    slug,
    date: metadata.date,
    wordCount: markdown.split(/\s+/).filter(w => w.length > 0).length,
    markdown: fullMarkdown
  };
}

/**
 * Convert HTML string directly to Markdown (without file I/O)
 *
 * @param {string} html - HTML content to convert
 * @param {Object} [options] - Conversion options
 * @param {string} [options.slug] - Article slug
 * @param {string} [options.category] - Article category
 * @param {number} [options.seriesOrder] - Order in series
 * @returns {Object} Conversion result with metadata and markdown
 */
function convertHtml(html, options = {}) {
  const extracted = extractMetadata(html);
  const content = extractArticleContent(html);
  const markdown = htmlToMarkdown(content);

  const metadata = {
    title: options.title || extracted.title,
    slug: options.slug || '',
    date: options.date || extracted.date,
    canonicalUrl: options.canonicalUrl || extracted.canonicalUrl,
    description: options.description || extracted.description,
    category: options.category,
    seriesOrder: options.seriesOrder
  };

  const frontMatter = generateFrontMatter(metadata);
  const fullMarkdown = `${frontMatter}\n\n${markdown}\n`;

  return {
    metadata,
    content: markdown,
    fullMarkdown,
    wordCount: markdown.split(/\s+/).filter(w => w.length > 0).length
  };
}

module.exports = {
  convertFile,
  convertHtml,
  htmlToMarkdown,
  extractArticleContent,
  extractMetadata,
  cleanText,
  generateFrontMatter
};
