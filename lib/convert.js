/**
 * @fileoverview WordPress HTML to Markdown conversion
 * @module draftsmith/convert
 */

const fs = require('fs');
const path = require('path');

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
  const entryMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<footer|<nav|<aside|$)/i);
  if (entryMatch) {
    content = entryMatch[1];
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
 * - title: From h1.entry-title, h1, title tag, or og:title
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
  // Extract title - try multiple patterns
  let title = '';
  const titlePatterns = [
    /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h1>/i,
    /<h1[^>]*>(.*?)<\/h1>/i,
    /<title>([^<|]+)/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
  ];
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      title = cleanText(match[1]);
      break;
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
  const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : '';

  // Extract meta description
  let description = '';
  const descPatterns = [
    /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
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
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '...')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert HTML to Markdown
 *
 * Handles:
 * - WordPress block editor patterns (wp-block-heading, wp-block-list, etc.)
 * - Headings (h1-h6)
 * - Links and images
 * - Bold, italic, code
 * - Code blocks with language hints
 * - Blockquotes
 * - Ordered and unordered lists
 * - Paragraphs and line breaks
 *
 * @param {string} html - HTML content to convert
 * @returns {string} Converted Markdown
 */
function htmlToMarkdown(html) {
  let md = html;

  // Remove WordPress block comments
  md = md.replace(/<!--\s*\/?wp:[^>]*-->/g, '');

  // Normalize whitespace between tags (helps with parsing)
  md = md.replace(/>\s+</g, '><');

  // Remove figure wrappers but keep content
  md = md.replace(/<figure[^>]*>([\s\S]*?)<\/figure>/gi, '$1');
  md = md.replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi, '*$1*\n');

  // Convert headings - handle WordPress block headings first, then regular
  md = md.replace(/<h2[^>]*class="wp-block-heading"[^>]*>(.*?)<\/h2>/gi, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*class="wp-block-heading"[^>]*>(.*?)<\/h3>/gi, '\n### $1\n\n');
  md = md.replace(/<h4[^>]*class="wp-block-heading"[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n\n');
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n\n');

  // Convert links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Convert images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Convert emphasis
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Convert inline code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Convert pre/code blocks
  md = md.replace(/<pre[^>]*><code[^>]*class="[^"]*language-(\w+)[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```$1\n$2\n```\n');
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

  // Convert blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    const lines = content.replace(/<\/?p[^>]*>/gi, '\n').split('\n');
    return lines.map(line => line.trim() ? `> ${line.trim()}` : '').join('\n') + '\n';
  });

  // Convert lists - handle WordPress block lists
  md = md.replace(/<ul[^>]*class="wp-block-list"[^>]*>/gi, '\n');
  md = md.replace(/<ol[^>]*class="wp-block-list"[^>]*>/gi, '\n');
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
    return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n') + '\n';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
    let counter = 1;
    return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, text) => `${counter++}. ${text}\n`) + '\n';
  });
  // Clean up any remaining list tags
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

  // Convert paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Convert horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Remove remaining HTML tags
  md = md.replace(/<div[^>]*>/gi, '\n');
  md = md.replace(/<\/div>/gi, '\n');
  md = md.replace(/<span[^>]*>(.*?)<\/span>/gi, '$1');
  md = md.replace(/<[^>]+>/g, '');

  // Clean up HTML entities
  md = cleanText(md);

  // Fix multiple newlines
  md = md.replace(/\n{3,}/g, '\n\n');

  // Trim lines
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
