/**
 * @fileoverview Export markdown back to WordPress-ready HTML
 * @module ownwords/export
 *
 * Converts markdown files back to clean HTML suitable for
 * pasting into the WordPress block editor.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Get image dimensions from a local file
 *
 * Uses file-type-specific methods to read dimensions:
 * - JPEG: Reads JFIF/Exif markers
 * - PNG: Reads IHDR chunk
 * - WebP: Reads VP8 header
 *
 * Falls back to sips on macOS if needed.
 *
 * @param {string} imagePath - Path to the image file
 * @returns {{width: number, height: number}|null} Dimensions or null if unable to read
 */
function getImageDimensions(imagePath) {
  if (!fs.existsSync(imagePath)) {
    return null;
  }

  try {
    const buffer = fs.readFileSync(imagePath);

    // Detect format by magic bytes, not file extension
    // (files may have wrong extensions)

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length > 8 && buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      return getPngDimensions(buffer);
    }

    // JPEG: FF D8 FF
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return getJpegDimensions(buffer);
    }

    // WebP: RIFF....WEBP
    if (buffer.length > 12 && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
      return getWebpDimensions(buffer);
    }

    // GIF: GIF87a or GIF89a
    if (buffer.length > 6 && buffer.slice(0, 3).toString() === 'GIF') {
      return getGifDimensions(buffer);
    }

    // Fallback: try sips on macOS
    return getSipsDimensions(imagePath);
  } catch (error) {
    // Silent failure - dimensions are optional
    return null;
  }
}

/**
 * Get JPEG dimensions from buffer
 * @private
 */
function getJpegDimensions(buffer) {
  // JPEG dimensions are in SOF (Start of Frame) markers
  // SOF0 = 0xFFC0, SOF1 = 0xFFC1, SOF2 = 0xFFC2
  let i = 2; // Skip SOI marker
  while (i < buffer.length) {
    if (buffer[i] !== 0xFF) {
      i++;
      continue;
    }
    const marker = buffer[i + 1];
    // SOF markers (0xC0-0xCF except 0xC4, 0xC8, 0xCC)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const height = buffer.readUInt16BE(i + 5);
      const width = buffer.readUInt16BE(i + 7);
      return { width, height };
    }
    // Skip to next marker
    const length = buffer.readUInt16BE(i + 2);
    i += 2 + length;
  }
  return null;
}

/**
 * Get PNG dimensions from buffer
 * @private
 */
function getPngDimensions(buffer) {
  // PNG dimensions are in IHDR chunk at fixed offset
  if (buffer.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return null; // Not a PNG
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * Get WebP dimensions from buffer
 * @private
 */
function getWebpDimensions(buffer) {
  // WebP has RIFF header, then VP8/VP8L/VP8X chunk
  if (buffer.slice(0, 4).toString() !== 'RIFF' || buffer.slice(8, 12).toString() !== 'WEBP') {
    return null;
  }
  const chunkType = buffer.slice(12, 16).toString();
  if (chunkType === 'VP8 ') {
    // Lossy WebP - dimensions at offset 26-29
    const width = buffer.readUInt16LE(26) & 0x3FFF;
    const height = buffer.readUInt16LE(28) & 0x3FFF;
    return { width, height };
  } else if (chunkType === 'VP8L') {
    // Lossless WebP - dimensions encoded in first 4 bytes after header
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    const width = 1 + (((b1 & 0x3F) << 8) | b0);
    const height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
    return { width, height };
  } else if (chunkType === 'VP8X') {
    // Extended WebP - dimensions at offset 24-29
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }
  return null;
}

/**
 * Get GIF dimensions from buffer
 * @private
 */
function getGifDimensions(buffer) {
  // GIF dimensions are at fixed offset 6-9
  if (buffer.slice(0, 3).toString() !== 'GIF') {
    return null;
  }
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return { width, height };
}

/**
 * Get dimensions using sips (macOS only, fallback)
 * @private
 */
function getSipsDimensions(imagePath) {
  try {
    const output = execSync(`sips -g pixelWidth -g pixelHeight "${imagePath}" 2>/dev/null`, { encoding: 'utf8' });
    const widthMatch = output.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = output.match(/pixelHeight:\s*(\d+)/);
    if (widthMatch && heightMatch) {
      return {
        width: parseInt(widthMatch[1], 10),
        height: parseInt(heightMatch[1], 10)
      };
    }
  } catch (e) {
    // sips not available or failed
  }
  return null;
}

// Maximum width for images in WordPress content area
const MAX_IMAGE_WIDTH = 1400;

/**
 * Add width and height attributes to local images in HTML
 *
 * This function post-processes the HTML to add image dimensions,
 * which helps WordPress/Jetpack properly size images and prevents
 * layout shift during page load.
 *
 * Dimensions are capped at MAX_IMAGE_WIDTH (1400px) to prevent
 * oversized images from breaking layouts. Height is scaled proportionally.
 *
 * @param {string} html - HTML content with image tags
 * @param {string} mdDir - Directory containing the markdown file (for resolving image paths)
 * @returns {string} HTML with image dimensions added
 */
function addImageDimensions(html, mdDir) {
  // Match img tags with local src paths (not http/https)
  return html.replace(/<img\s+src="([^"]+)"([^>]*)>/g, (match, src, rest) => {
    // Skip external URLs
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return match;
    }

    // Resolve the image path relative to the markdown directory
    const imagePath = path.resolve(mdDir, src);
    const dimensions = getImageDimensions(imagePath);

    if (dimensions && dimensions.width && dimensions.height) {
      // Check if width/height already present
      if (rest.includes('width=') || rest.includes('height=')) {
        return match;
      }

      let { width, height } = dimensions;

      // Cap dimensions at MAX_IMAGE_WIDTH, scaling height proportionally
      if (width > MAX_IMAGE_WIDTH) {
        const scale = MAX_IMAGE_WIDTH / width;
        width = MAX_IMAGE_WIDTH;
        height = Math.round(height * scale);
      }

      // Insert width and height after src
      return `<img src="${src}" width="${width}" height="${height}"${rest}>`;
    }

    return match;
  });
}

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

  // Extract code blocks and replace with placeholders to protect from other transformations
  // Support both backtick (```) and tilde (~~~) fences - tilde fences allow nested backtick blocks
  const codeBlocks = [];
  const preStyle = 'background:#1e1e1e;border:1px solid #333;border-radius:6px;padding:1.25em;overflow-x:auto;font-family:\'SF Mono\',Consolas,Monaco,\'Courier New\',monospace;font-size:0.875em;line-height:1.6;margin:1.5em 0;color:#e0e0e0;';
  // Process tilde fences first (they may contain backtick fences inside)
  html = html.replace(/~~~(\w*)\n([\s\S]*?)~~~/g, (match, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre style="${preStyle}"><code${langClass}>${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });
  // Then process backtick fences
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre style="${preStyle}"><code${langClass}>${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });

  // Inline code - also protect from other transformations
  const inlineCodes = [];
  const inlineCodeStyle = 'background:#f5f5f5;padding:0.2em 0.4em;border-radius:3px;font-family:\'SF Mono\',Consolas,Monaco,\'Courier New\',monospace;font-size:0.9em;color:#c7254e;';
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code style="${inlineCodeStyle}">${escapeHtml(code)}</code>`);
    return placeholder;
  });

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

  // Linked images [![alt](img)](url) - must come before regular images
  // The link wraps the img element inside the figure for valid HTML structure
  // Use "wp-block-image size-large aligncenter" classes for WordPress
  html = html.replace(/\[!\[([^\]]*)\]\(([^\s")]+)(?:\s+"((?:[^"\\]|\\.)*)")?\)\]\(([^)]+)\)/g, (match, alt, src, title, href) => {
    const escapedAlt = escapeHtml(alt);
    let imgHtml = `<figure class="wp-block-image size-large aligncenter">`;
    imgHtml += `<a href="${href}"><img src="${src}" alt="${escapedAlt}" style="max-width: 100%; height: auto;" loading="lazy" /></a>`;
    if (title) {
      const unescapedTitle = title.replace(/\\"/g, '"');
      imgHtml += `<figcaption>${escapeHtml(unescapedTitle)}</figcaption>`;
    }
    imgHtml += `</figure>`;
    return imgHtml;
  });

  // Regular images (must come before links to prevent ![alt](url) being parsed as link)
  // Match ![alt](path) or ![alt](path "title") - wrap in figure with optional figcaption
  // The title pattern handles escaped quotes like \" using ((?:[^"\\]|\\.)*)
  // Use "wp-block-image size-large aligncenter" classes for WordPress:
  // - size-large: constrains images to content width
  // - aligncenter: centers images that are smaller than content width
  html = html.replace(/!\[([^\]]*)\]\(([^\s")]+)(?:\s+"((?:[^"\\]|\\.)*)")?\)/g, (match, alt, src, title) => {
    const escapedAlt = escapeHtml(alt);
    let imgHtml = `<figure class="wp-block-image size-large aligncenter">`;
    imgHtml += `<img src="${src}" alt="${escapedAlt}" style="max-width: 100%; height: auto;" loading="lazy" />`;
    if (title) {
      // Unescape any escaped quotes in the title
      const unescapedTitle = title.replace(/\\"/g, '"');
      imgHtml += `<figcaption>${escapeHtml(unescapedTitle)}</figcaption>`;
    }
    imgHtml += `</figure>`;
    return imgHtml;
  });

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes - convert to WordPress Gutenberg quote blocks
  html = html.replace(/^> (.+)$/gm, '<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>$1</p></blockquote>\n<!-- /wp:quote -->');

  // Tables - GFM style
  // Must be processed before paragraphs to prevent table rows being wrapped in <p>
  html = convertTables(html);

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

  // Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    html = html.replace(`__INLINE_CODE_${i}__`, inlineCodes[i]);
  }

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

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

  const blockElements = ['<h', '<ul', '<ol', '<li', '<pre', '<blockquote', '<hr', '</ul', '</ol', '<table', '</table', '<figure'];

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
 * Convert GFM-style markdown tables to HTML
 * @private
 * @param {string} html - Content that may contain markdown tables
 * @returns {string} Content with tables converted to HTML
 */
function convertTables(html) {
  const lines = html.split('\n');
  const result = [];
  let tableLines = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this looks like a table row (starts and ends with |, or has | in middle)
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');
    // Check if this is a separator row (only |, -, :, and spaces)
    const isSeparator = /^\|[\s\-:|]+\|$/.test(trimmed);

    if (isTableRow || isSeparator) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(trimmed);
    } else {
      if (inTable) {
        // End of table - convert it
        result.push(convertTableBlock(tableLines));
        inTable = false;
        tableLines = [];
      }
      result.push(line);
    }
  }

  // Handle table at end of content
  if (inTable && tableLines.length > 0) {
    result.push(convertTableBlock(tableLines));
  }

  return result.join('\n');
}

/**
 * Convert a block of table lines to HTML table
 * @private
 */
function convertTableBlock(lines) {
  if (lines.length < 2) {
    // Not a valid table (need at least header and separator)
    return lines.join('\n');
  }

  // Parse header row
  const headerRow = lines[0];
  const headers = parseTableRow(headerRow);

  // Check if second line is separator
  const separatorLine = lines[1];
  if (!/^\|[\s\-:|]+\|$/.test(separatorLine)) {
    // Not a valid table separator
    return lines.join('\n');
  }

  // Parse alignment from separator
  const alignments = parseSeparator(separatorLine);

  // Build HTML table with inline styles for WordPress compatibility
  const tableStyle = 'border-collapse:collapse;width:100%;margin:1.5em 0;';
  const thStyle = 'border:1px solid #ddd;padding:0.75em;text-align:left;background-color:#f8f9fa;font-weight:600;';
  const tdStyle = 'border:1px solid #ddd;padding:0.75em;text-align:left;';

  let html = `<table style="${tableStyle}">\n<thead>\n<tr>\n`;

  // Add header cells
  headers.forEach((cell, idx) => {
    const align = alignments[idx] || 'left';
    const style = thStyle.replace('text-align:left', `text-align:${align}`);
    html += `<th style="${style}">${cell}</th>\n`;
  });

  html += '</tr>\n</thead>\n<tbody>\n';

  // Add body rows
  for (let i = 2; i < lines.length; i++) {
    const cells = parseTableRow(lines[i]);
    const rowStyle = i % 2 === 0 ? 'background-color:#fafafa;' : '';
    html += '<tr>\n';
    cells.forEach((cell, idx) => {
      const align = alignments[idx] || 'left';
      const style = tdStyle.replace('text-align:left', `text-align:${align}`) + rowStyle;
      html += `<td style="${style}">${cell}</td>\n`;
    });
    html += '</tr>\n';
  }

  html += '</tbody>\n</table>';

  return html;
}

/**
 * Parse cells from a table row
 * @private
 */
function parseTableRow(row) {
  // Remove leading/trailing pipes and split
  const trimmed = row.replace(/^\||\|$/g, '');
  return trimmed.split('|').map(cell => cell.trim());
}

/**
 * Parse alignment from separator row
 * @private
 */
function parseSeparator(row) {
  const trimmed = row.replace(/^\||\|$/g, '');
  const cells = trimmed.split('|');

  return cells.map(cell => {
    cell = cell.trim();
    const leftColon = cell.startsWith(':');
    const rightColon = cell.endsWith(':');

    if (leftColon && rightColon) return 'center';
    if (rightColon) return 'right';
    return 'left';
  });
}

/**
 * Parse a YAML value, handling quotes and escapes
 * @private
 */
function parseYamlValue(value) {
  if (!value) return '';
  value = value.trim();
  // Remove outer quotes
  value = value.replace(/^["']|["']$/g, '');
  // Unescape escaped quotes (\" -> " and \' -> ')
  value = value.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return value;
}

/**
 * Extract front matter from markdown
 * Handles simple key-value pairs, arrays, and nested objects
 * @private
 */
function extractFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n*/m);
  if (!match) return { frontMatter: {}, body: markdown };

  const frontMatterText = match[1];
  const body = markdown.substring(match[0].length);
  const frontMatter = {};

  const lines = frontMatterText.split('\n');
  let currentKey = null;
  let currentArray = null;
  let currentObject = null;
  let objectKey = null;
  let nestedArrayKey = null;  // Track nested array inside object
  let nestedArray = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^(\s*)/)[1].length;

    // Array item (starts with spaces + "- ")
    if (line.match(/^\s+-\s+/)) {
      const itemValue = line.replace(/^\s+-\s+/, '').trim();
      // Check if this is a nested array inside an object (indent >= 4)
      if (indent >= 4 && nestedArray !== null && nestedArrayKey) {
        const num = Number(itemValue);
        nestedArray.push(isNaN(num) ? parseYamlValue(itemValue) : num);
      } else if (currentArray !== null && currentKey) {
        // Top-level array
        currentArray.push(parseYamlValue(itemValue));
      }
      continue;
    }

    // Nested object property (starts with "  key:")
    if (indent > 0 && line.includes(':') && currentObject !== null) {
      // Save previous nested array if any
      if (nestedArray !== null && nestedArrayKey) {
        currentObject[nestedArrayKey] = nestedArray;
        nestedArray = null;
        nestedArrayKey = null;
      }

      const colonIndex = line.indexOf(':');
      const nestedKey = line.substring(0, colonIndex).trim();
      let nestedValue = line.substring(colonIndex + 1).trim();

      // Handle inline array like "tag_ids: [12374, 276453]"
      if (nestedValue.startsWith('[') && nestedValue.endsWith(']')) {
        const arrayContent = nestedValue.slice(1, -1);
        currentObject[nestedKey] = arrayContent.split(',').map(v => {
          const trimmed = v.trim();
          // Try to parse as number
          const num = Number(trimmed);
          return isNaN(num) ? parseYamlValue(trimmed) : num;
        });
      } else if (nestedValue === '') {
        // Could be start of nested array - look ahead
        const nextLine = lines[i + 1] || '';
        if (nextLine.match(/^\s{4,}-\s+/)) {
          // It's a nested array (4+ spaces + "- ")
          nestedArrayKey = nestedKey;
          nestedArray = [];
        } else {
          currentObject[nestedKey] = '';
        }
      } else {
        currentObject[nestedKey] = parseYamlValue(nestedValue);
      }
      continue;
    }

    // Top-level key-value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && indent === 0) {
      // Save previous nested array if any
      if (nestedArray !== null && nestedArrayKey && currentObject !== null) {
        currentObject[nestedArrayKey] = nestedArray;
        nestedArray = null;
        nestedArrayKey = null;
      }
      // Save previous array or object if any
      if (currentArray !== null && currentKey) {
        frontMatter[currentKey] = currentArray;
        currentArray = null;
      }
      if (currentObject !== null && objectKey) {
        frontMatter[objectKey] = currentObject;
        currentObject = null;
        objectKey = null;
      }

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (value === '') {
        // Could be start of array or nested object
        // Look ahead to determine which
        const nextLine = lines[i + 1] || '';
        if (nextLine.match(/^\s+-\s+/)) {
          // It's an array
          currentKey = key;
          currentArray = [];
        } else if (nextLine.match(/^\s+\w+:/)) {
          // It's a nested object
          objectKey = key;
          currentObject = {};
        } else {
          frontMatter[key] = '';
        }
      } else {
        frontMatter[key] = parseYamlValue(value);
        currentKey = null;
      }
    }
  }

  // Save any remaining nested array
  if (nestedArray !== null && nestedArrayKey && currentObject !== null) {
    currentObject[nestedArrayKey] = nestedArray;
  }
  // Save any remaining array or object
  if (currentArray !== null && currentKey) {
    frontMatter[currentKey] = currentArray;
  }
  if (currentObject !== null && objectKey) {
    frontMatter[objectKey] = currentObject;
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
  const mdDir = path.dirname(mdPath);

  let html = markdownToHtml(body);

  // Add image dimensions to local images for better WordPress rendering
  // This helps WordPress/Jetpack properly size images without layout shift
  html = addImageDimensions(html, mdDir);

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
    wordCount: body.split(/\s+/).filter(w => w.length > 0).length,
    metadata: frontMatter
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
