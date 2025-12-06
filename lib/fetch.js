/**
 * @fileoverview WordPress article fetching functionality
 * @module ownwords/fetch
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Extract the slug from a WordPress URL
 *
 * Supports common WordPress permalink patterns:
 * - /blog/YYYY/MM/DD/slug/
 * - /YYYY/MM/DD/slug/
 * - /slug/ (simple permalinks)
 *
 * @param {string} url - The WordPress article URL
 * @returns {string|null} The extracted slug, or null if not found
 *
 * @example
 * extractSlugFromUrl('https://example.com/blog/2025/11/09/my-article/')
 * // Returns: 'my-article'
 *
 * @example
 * extractSlugFromUrl('https://example.com/2025/11/09/my-article/')
 * // Returns: 'my-article'
 */
function extractSlugFromUrl(url) {
  // Try /blog/YYYY/MM/DD/slug/ pattern first
  let match = url.match(/\/blog\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/);
  if (match) return match[1];

  // Try /YYYY/MM/DD/slug/ pattern
  match = url.match(/\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/);
  if (match) return match[1];

  // Try simple /slug/ pattern (last path segment)
  match = url.match(/\/([^/]+)\/?$/);
  if (match && match[1] && !match[1].includes('.')) return match[1];

  return null;
}

/**
 * Fetch a WordPress article and save the raw HTML
 *
 * Uses curl to fetch the article content. The function will:
 * - Create the output directory if it doesn't exist
 * - Validate that the fetched content is substantial (>1KB)
 * - Return the HTML content for further processing
 *
 * @param {string} url - The WordPress article URL to fetch
 * @param {string} outputPath - Path where the HTML will be saved
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.silent=false] - Suppress console output
 * @param {number} [options.timeout=30000] - Curl timeout in milliseconds
 * @returns {string} The fetched HTML content
 * @throws {Error} If fetch fails or content is too short
 *
 * @example
 * const html = fetchArticle(
 *   'https://example.com/blog/2025/11/09/my-article/',
 *   './raw/my-article.html'
 * );
 */
function fetchArticle(url, outputPath, options = {}) {
  const { silent = false, timeout = 30000 } = options;

  if (!silent) {
    console.log(`Fetching: ${url}`);
  }

  const timeoutSeconds = Math.ceil(timeout / 1000);
  const html = execSync(`curl -sL --max-time ${timeoutSeconds} "${url}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  });

  if (!html || html.length < 1000) {
    throw new Error('Retrieved content seems too short - check URL');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html);

  if (!silent) {
    console.log(`  Saved: ${outputPath} (${(html.length / 1024).toFixed(1)} KB)`);
  }

  return html;
}

/**
 * Fetch multiple WordPress articles
 *
 * @param {string[]} urls - Array of WordPress article URLs
 * @param {string} outputDir - Directory to save HTML files
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.silent=false] - Suppress console output
 * @param {boolean} [options.continueOnError=true] - Continue fetching if one fails
 * @returns {Object[]} Array of results with url, slug, outputPath, success, and optional error
 *
 * @example
 * const results = fetchMultiple(
 *   ['https://example.com/blog/2025/11/09/article-1/', 'https://example.com/blog/2025/11/09/article-2/'],
 *   './raw'
 * );
 */
function fetchMultiple(urls, outputDir, options = {}) {
  const { silent = false, continueOnError = true } = options;
  const results = [];

  for (const url of urls) {
    const slug = extractSlugFromUrl(url);
    if (!slug) {
      const result = {
        url,
        slug: null,
        outputPath: null,
        success: false,
        error: 'Could not extract slug from URL'
      };
      results.push(result);
      if (!continueOnError) break;
      continue;
    }

    const outputPath = path.join(outputDir, `${slug}.html`);

    try {
      fetchArticle(url, outputPath, { silent });
      results.push({
        url,
        slug,
        outputPath,
        success: true
      });
    } catch (error) {
      const result = {
        url,
        slug,
        outputPath,
        success: false,
        error: error.message
      };
      results.push(result);
      if (!continueOnError) break;
    }
  }

  return results;
}

module.exports = {
  fetchArticle,
  fetchMultiple,
  extractSlugFromUrl
};
