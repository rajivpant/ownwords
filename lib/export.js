/**
 * @fileoverview Export markdown back to WordPress-ready HTML
 * @module draftsmith/export
 *
 * Converts markdown files back to clean HTML suitable for
 * pasting into the WordPress block editor.
 */

const fs = require('fs');
const path = require('path');

/**
 * Convert markdown to HTML
 *
 * A simple markdown to HTML converter for basic formatting.
 * For complex documents, consider using a full library like marked.
 *
 * @param {string} markdown - Markdown content (without front matter)
 * @returns {string} HTML content
 */
function markdownToHtml(markdown) {
  let html = markdown;

  // Code blocks (must be done before other transformations)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langClass}>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr />');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\* )(.+)$/gm, '<li>$2</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive list items
  html = wrapListItems(html);

  // Paragraphs - wrap remaining text blocks
  html = wrapParagraphs(html);

  return html.trim();
}

/**
 * Escape HTML special characters
 * @private
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Wrap consecutive <li> elements in <ul>
 * @private
 */
function wrapListItems(html) {
  const lines = html.split('\n');
  const result = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<li>')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(line);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}

/**
 * Wrap plain text blocks in <p> tags
 * @private
 */
function wrapParagraphs(html) {
  const lines = html.split('\n\n');
  const result = [];

  const blockElements = ['<h', '<ul', '<ol', '<li', '<pre', '<blockquote', '<hr', '</ul', '</ol'];

  for (const block of lines) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const isBlock = blockElements.some(tag => trimmed.startsWith(tag));
    if (isBlock) {
      result.push(trimmed);
    } else {
      // Wrap in paragraph
      result.push(`<p>${trimmed.replace(/\n/g, '<br />')}</p>`);
    }
  }

  return result.join('\n\n');
}

/**
 * Extract front matter from markdown
 * @private
 */
function extractFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n*/m);
  if (!match) return { frontMatter: {}, body: markdown };

  const frontMatterText = match[1];
  const body = markdown.substring(match[0].length);
  const frontMatter = {};

  const lines = frontMatterText.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      value = value.replace(/^["']|["']$/g, '');
      frontMatter[key] = value;
    }
  }

  return { frontMatter, body };
}

/**
 * Export a markdown file to WordPress-ready HTML
 *
 * @param {string} mdPath - Path to markdown file
 * @param {string} [outputPath] - Path for output HTML (optional)
 * @param {Object} [options] - Export options
 * @param {boolean} [options.includeWrapper=false] - Include WordPress block wrappers
 * @param {boolean} [options.rewriteImages=false] - Rewrite image URLs to absolute
 * @param {string} [options.imageBaseUrl] - Base URL for images
 * @returns {Object} Export result with html and metadata
 *
 * @example
 * const result = exportToWordPress('./content/articles/my-article.md');
 * console.log(result.html);
 */
function exportToWordPress(mdPath, outputPath, options = {}) {
  const { includeWrapper = false, rewriteImages = false, imageBaseUrl = '' } = options;

  const markdown = fs.readFileSync(mdPath, 'utf-8');
  const { frontMatter, body } = extractFrontMatter(markdown);

  let html = markdownToHtml(body);

  // Optionally rewrite image URLs to absolute
  if (rewriteImages && imageBaseUrl) {
    html = html.replace(/src="\/([^"]+)"/g, `src="${imageBaseUrl}/$1"`);
  }

  // Optionally add WordPress block wrappers
  if (includeWrapper) {
    html = wrapWithWordPressBlocks(html);
  }

  const result = {
    title: frontMatter.title || '',
    slug: frontMatter.slug || path.basename(mdPath, '.md'),
    date: frontMatter.date || '',
    canonicalUrl: frontMatter.canonical_url || '',
    html,
    wordCount: body.split(/\s+/).filter(w => w.length > 0).length
  };

  // Write to file if output path specified
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, html);
    result.outputPath = outputPath;
  }

  return result;
}

/**
 * Wrap HTML with WordPress block comments
 * @private
 */
function wrapWithWordPressBlocks(html) {
  // Add WordPress block comments for major elements
  let wrapped = html;

  // Wrap headings
  wrapped = wrapped.replace(/<h2>([^<]+)<\/h2>/g, '<!-- wp:heading -->\n<h2 class="wp-block-heading">$1</h2>\n<!-- /wp:heading -->');
  wrapped = wrapped.replace(/<h3>([^<]+)<\/h3>/g, '<!-- wp:heading {"level":3} -->\n<h3 class="wp-block-heading">$1</h3>\n<!-- /wp:heading -->');
  wrapped = wrapped.replace(/<h4>([^<]+)<\/h4>/g, '<!-- wp:heading {"level":4} -->\n<h4 class="wp-block-heading">$1</h4>\n<!-- /wp:heading -->');

  // Wrap paragraphs
  wrapped = wrapped.replace(/<p>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]*>)*[^<]*)<\/p>/g, '<!-- wp:paragraph -->\n<p>$1</p>\n<!-- /wp:paragraph -->');

  // Wrap lists
  wrapped = wrapped.replace(/<ul>([\s\S]*?)<\/ul>/g, '<!-- wp:list -->\n<ul class="wp-block-list">$1</ul>\n<!-- /wp:list -->');

  // Wrap code blocks
  wrapped = wrapped.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, '<!-- wp:code -->\n<pre class="wp-block-code"><code$1>$2</code></pre>\n<!-- /wp:code -->');

  return wrapped;
}

/**
 * Export multiple markdown files to WordPress HTML
 *
 * @param {string} mdDir - Directory containing markdown files
 * @param {string} outputDir - Output directory for HTML files
 * @param {Object} [options] - Export options
 * @returns {Object[]} Array of export results
 */
function exportBatch(mdDir, outputDir, options = {}) {
  const files = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));
  const results = [];

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const file of files) {
    const mdPath = path.join(mdDir, file);
    const slug = path.basename(file, '.md');
    const outputPath = path.join(outputDir, `${slug}.html`);

    try {
      const result = exportToWordPress(mdPath, outputPath, options);
      results.push({
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        success: false,
        slug,
        error: error.message
      });
    }
  }

  return results;
}

module.exports = {
  exportToWordPress,
  exportBatch,
  markdownToHtml
};
