/**
 * @fileoverview WordPress REST API-based article fetching
 * @module ownwords/fetch-api
 *
 * Fetches WordPress articles via REST API instead of HTML scraping.
 * Provides richer metadata (categories, tags, author, featured image)
 * and produces both markdown and JSON sidecar files for sync operations.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const { WpClient } = require('./wp-api');
const { htmlToMarkdown, cleanText } = require('./convert');
const { readConfig, getWordPressSite } = require('./config');

/**
 * Extract slug from a WordPress URL
 *
 * Handles various URL patterns:
 * - /blog/2025/01/01/my-article/
 * - /my-article/
 * - /my-article
 *
 * @param {string} url - WordPress article URL
 * @returns {string} Extracted slug
 */
function extractSlugFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    // If URL parsing fails, treat as slug directly
    return url.replace(/\/$/, '').split('/').pop() || url;
  }
}

/**
 * Extract domain from URL
 *
 * @param {string} url - Full URL
 * @returns {string} Domain (e.g., 'example.com')
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

/**
 * Find a configured site by matching domain
 *
 * @param {string} domain - Domain to search for (e.g., 'rajiv.com')
 * @returns {Object|null} Site config or null if not found
 */
function findSiteByDomain(domain) {
  const config = readConfig();
  const sites = config.wordpress?.sites || {};

  for (const [name, site] of Object.entries(sites)) {
    try {
      const siteUrl = new URL(site.url);
      if (siteUrl.hostname === domain || siteUrl.hostname === `www.${domain}`) {
        return {
          name,
          url: site.url,
          username: site.username,
          appPassword: site.appPassword
        };
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return null;
}

/**
 * Extract all image URLs from HTML content
 *
 * Handles various WordPress image patterns:
 * - Standard <img src="..."> tags
 * - WordPress Jetpack CDN URLs (i0.wp.com, i1.wp.com, i2.wp.com)
 * - srcset attributes
 * - Figure/figcaption patterns
 *
 * @param {string} html - HTML content
 * @returns {string[]} Array of unique image URLs
 */
function extractImageUrls(html) {
  const urls = new Set();

  // Match img src attributes
  const srcPattern = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = srcPattern.exec(html)) !== null) {
    urls.add(match[1]);
  }

  // Match srcset attributes (get all URLs, not just the first)
  const srcsetPattern = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetPattern.exec(html)) !== null) {
    // srcset format: "url1 1x, url2 2x" or "url1 300w, url2 600w"
    const srcsetUrls = match[1].split(',').map(part => part.trim().split(/\s+/)[0]);
    srcsetUrls.forEach(url => urls.add(url));
  }

  // Match data-orig-file attributes (WordPress full-size originals)
  const origPattern = /data-orig-file=["']([^"']+)["']/gi;
  while ((match = origPattern.exec(html)) !== null) {
    urls.add(match[1]);
  }

  // Filter out non-image URLs and data URIs
  return Array.from(urls).filter(url => {
    if (url.startsWith('data:')) return false;
    if (!url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) return false;
    return true;
  });
}

/**
 * Extract image URLs from markdown content
 *
 * @param {string} markdown - Markdown content
 * @returns {string[]} Array of unique image URLs
 */
function extractImageUrlsFromMarkdown(markdown) {
  const urls = new Set();

  // Match ![alt](url) pattern
  const mdPattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = mdPattern.exec(markdown)) !== null) {
    urls.add(match[1]);
  }

  // Match <img src="..."> HTML in markdown
  const htmlPattern = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((match = htmlPattern.exec(markdown)) !== null) {
    urls.add(match[1]);
  }

  return Array.from(urls).filter(url => {
    if (url.startsWith('data:')) return false;
    return true;
  });
}

/**
 * Generate a safe filename from a URL
 *
 * @param {string} url - Image URL
 * @returns {string} Safe filename
 */
function urlToFilename(url) {
  try {
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname);

    // Remove query parameters from filename
    filename = filename.split('?')[0];

    // Handle WordPress Jetpack CDN URLs that may not have extensions
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      // Try to detect from URL
      if (url.includes('.jpg') || url.includes('.jpeg')) {
        filename += '.jpg';
      } else if (url.includes('.png')) {
        filename += '.png';
      } else if (url.includes('.webp')) {
        filename += '.webp';
      } else {
        filename += '.jpg'; // Default to jpg
      }
    }

    // Sanitize filename
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '-');

    return filename;
  } catch {
    // Fallback: generate hash-based filename
    const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    return `image-${hash}.jpg`;
  }
}

/**
 * Get HTTP headers for a URL (HEAD request)
 *
 * @param {string} url - URL to check
 * @returns {Promise<{contentLength?: number, lastModified?: string, etag?: string, error?: string}>}
 */
async function getRemoteHeaders(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const request = protocol.request(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'ownwords/1.0 (WordPress content sync tool)'
        },
        timeout: 10000
      }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          getRemoteHeaders(response.headers.location).then(resolve);
          return;
        }

        if (response.statusCode !== 200) {
          resolve({ error: `HTTP ${response.statusCode}` });
          return;
        }

        resolve({
          contentLength: response.headers['content-length'] ? parseInt(response.headers['content-length']) : undefined,
          lastModified: response.headers['last-modified'],
          etag: response.headers['etag']
        });
      });

      request.on('error', (err) => {
        resolve({ error: err.message });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({ error: 'Timeout' });
      });

      request.end();
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

/**
 * Download an image from a URL
 *
 * @param {string} url - Image URL to download
 * @param {string} destPath - Destination file path
 * @param {Object} [options] - Download options
 * @param {string} [options.ifModifiedSince] - Only download if modified since this date
 * @returns {Promise<{success: boolean, size?: number, error?: string, notModified?: boolean}>}
 */
async function downloadImage(url, destPath, options = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const headers = {
        'User-Agent': 'ownwords/1.0 (WordPress content sync tool)'
      };

      if (options.ifModifiedSince) {
        headers['If-Modified-Since'] = options.ifModifiedSince;
      }

      const request = protocol.get(url, {
        headers,
        timeout: 30000
      }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          downloadImage(response.headers.location, destPath, options).then(resolve);
          return;
        }

        // 304 Not Modified - file hasn't changed
        if (response.statusCode === 304) {
          resolve({ success: true, notModified: true });
          return;
        }

        if (response.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
          return;
        }

        const fileStream = fs.createWriteStream(destPath);
        let size = 0;

        response.on('data', (chunk) => {
          size += chunk.length;
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve({ success: true, size, lastModified: response.headers['last-modified'] });
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {}); // Delete partial file
          resolve({ success: false, error: err.message });
        });
      });

      request.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({ success: false, error: 'Timeout' });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Download all images and return mapping of original URLs to local paths
 *
 * Images are downloaded only when needed:
 * - If the local file doesn't exist, download it
 * - If the local file exists, check if remote has been modified (using Content-Length comparison)
 * - Skip download if file is unchanged
 *
 * @param {string[]} imageUrls - Array of image URLs to download
 * @param {string} destDir - Directory to save images to
 * @param {Object} [options] - Download options
 * @param {boolean} [options.silent=false] - Suppress console output
 * @param {boolean} [options.force=false] - Force re-download even if file exists
 * @returns {Promise<Object>} Map of original URL to local filename
 */
async function downloadImages(imageUrls, destDir, options = {}) {
  const { silent = false, force = false } = options;
  const urlToLocal = {};
  const results = {
    downloaded: 0,
    skipped: 0,
    failed: 0,
    totalSize: 0,
    errors: []
  };

  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Deduplicate URLs and prefer highest quality versions
  const uniqueUrls = deduplicateImageUrls(imageUrls);

  for (const url of uniqueUrls) {
    const filename = urlToFilename(url);
    const destPath = path.join(destDir, filename);

    // Check if file already exists
    if (fs.existsSync(destPath) && !force) {
      // Get local file size
      const localStats = fs.statSync(destPath);
      const localSize = localStats.size;

      // Check remote file size
      const remoteHeaders = await getRemoteHeaders(url);

      if (remoteHeaders.contentLength && remoteHeaders.contentLength === localSize) {
        // File sizes match - skip download
        urlToLocal[url] = filename;
        results.skipped++;
        if (!silent) {
          console.log(`    ✓ Unchanged: ${filename} (${(localSize / 1024).toFixed(1)} KB)`);
        }
        continue;
      } else if (remoteHeaders.error) {
        // Couldn't check remote - assume local is OK
        urlToLocal[url] = filename;
        results.skipped++;
        if (!silent) {
          console.log(`    ✓ Cached: ${filename} (couldn't verify remote)`);
        }
        continue;
      }
      // File size differs - will re-download below
      if (!silent) {
        console.log(`    ↻ Changed: ${filename} (local: ${localSize}, remote: ${remoteHeaders.contentLength})`);
      }
    }

    if (!silent) {
      process.stdout.write(`    Downloading: ${filename}...`);
    }

    const result = await downloadImage(url, destPath);

    if (result.success) {
      urlToLocal[url] = filename;
      if (result.notModified) {
        results.skipped++;
        if (!silent) {
          console.log(` ✓ (not modified)`);
        }
      } else {
        results.downloaded++;
        results.totalSize += result.size || 0;
        if (!silent) {
          console.log(` ✅ (${((result.size || 0) / 1024).toFixed(1)} KB)`);
        }
      }
    } else {
      results.failed++;
      results.errors.push({ url, error: result.error });
      if (!silent) {
        console.log(` ❌ (${result.error})`);
      }
    }
  }

  return { urlToLocal, results };
}

/**
 * Deduplicate image URLs, preferring highest quality versions
 *
 * WordPress often includes multiple versions of the same image:
 * 1. Filename suffixes: image-300x200.jpg, image-1024x768.jpg
 * 2. Jetpack CDN query params: image.jpg?resize=300x200, image.jpg?w=1024
 *
 * This function groups URLs by their base image and keeps only the highest quality version.
 *
 * @param {string[]} urls - Array of image URLs
 * @returns {string[]} Deduplicated URLs
 */
function deduplicateImageUrls(urls) {
  // Group URLs by base image path (without size variants)
  const groups = {};

  for (const url of urls) {
    // Get the base URL without query params for grouping
    let baseKey;
    try {
      const urlObj = new URL(url);
      // Remove query string to get base path
      baseKey = `${urlObj.origin}${urlObj.pathname}`;

      // Also remove filename size suffixes like -300x200
      baseKey = baseKey
        .replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
        .replace(/-scaled(\.[a-z]+)$/i, '$1');
    } catch {
      // If URL parsing fails, use the URL with query params stripped
      baseKey = url.split('?')[0]
        .replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
        .replace(/-scaled(\.[a-z]+)$/i, '$1');
    }

    if (!groups[baseKey]) {
      groups[baseKey] = [];
    }
    groups[baseKey].push(url);
  }

  // For each group, prefer the highest quality version
  const result = [];
  for (const [baseKey, variants] of Object.entries(groups)) {
    if (variants.length === 1) {
      result.push(variants[0]);
    } else {
      // Score each URL and pick the highest quality
      let best = variants[0];
      let bestScore = getImageQualityScore(variants[0]);

      for (const v of variants.slice(1)) {
        const score = getImageQualityScore(v);
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      result.push(best);
    }
  }

  return result;
}

/**
 * Get a quality score for an image URL
 * Higher score = larger/better quality image
 *
 * @param {string} url - Image URL
 * @returns {number} Quality score
 */
function getImageQualityScore(url) {
  // Check for size in query params (Jetpack CDN pattern)
  // Examples: ?resize=1024x768, ?w=1024, ?fit=800x600
  const queryMatch = url.match(/[?&](resize|fit)=(\d+)[x%2C](\d+)/i);
  if (queryMatch) {
    return parseInt(queryMatch[2]) * parseInt(queryMatch[3]);
  }

  // Check for width-only in query params
  const widthMatch = url.match(/[?&]w=(\d+)/i);
  if (widthMatch) {
    // Assume square-ish aspect ratio for scoring
    return parseInt(widthMatch[1]) * parseInt(widthMatch[1]);
  }

  // Check for size in filename (WordPress standard pattern)
  const filenameMatch = url.match(/-(\d+)x(\d+)\.[a-z]+(\?|$)/i);
  if (filenameMatch) {
    return parseInt(filenameMatch[1]) * parseInt(filenameMatch[2]);
  }

  // No size info - assume it's the original (highest score)
  // But check if it looks like a full URL without resize params
  if (!url.includes('resize=') && !url.includes('fit=') && !url.match(/-\d+x\d+\./)) {
    return Number.MAX_SAFE_INTEGER; // Original image
  }

  // Default middle score
  return 1000000;
}

/**
 * Get the base path key for an image URL (for matching variants)
 *
 * @param {string} url - Image URL
 * @returns {string} Base path key
 */
function getImageBaseKey(url) {
  try {
    const urlObj = new URL(url);
    // Remove query string to get base path
    let baseKey = `${urlObj.origin}${urlObj.pathname}`;

    // Also remove filename size suffixes like -300x200
    baseKey = baseKey
      .replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
      .replace(/-scaled(\.[a-z]+)$/i, '$1');

    return baseKey;
  } catch {
    // If URL parsing fails, use the URL with query params stripped
    return url.split('?')[0]
      .replace(/-\d+x\d+(\.[a-z]+)$/i, '$1')
      .replace(/-scaled(\.[a-z]+)$/i, '$1');
  }
}

/**
 * Rewrite image URLs in markdown to use local paths
 * Matches URLs by base path, so all size variants get replaced
 *
 * @param {string} markdown - Markdown content
 * @param {Object} urlToLocal - Map of original URL to local filename
 * @returns {string} Markdown with rewritten image paths
 */
function rewriteImageUrls(markdown, urlToLocal) {
  // Build a map of base keys to local filenames
  const baseKeyToLocal = {};
  for (const [originalUrl, localFilename] of Object.entries(urlToLocal)) {
    const baseKey = getImageBaseKey(originalUrl);
    baseKeyToLocal[baseKey] = localFilename;
  }

  // Find all URLs in the markdown and replace them
  let result = markdown;

  // Match markdown image syntax: ![alt](url) - including linked images [![alt](url)](link)
  // Use a more robust regex that handles the full URL
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const baseKey = getImageBaseKey(url);
    if (baseKeyToLocal[baseKey]) {
      return `![${alt}](./${baseKeyToLocal[baseKey]})`;
    }
    return match;
  });

  // Match HTML img src attributes
  result = result.replace(/src=["']([^"']+)["']/gi, (match, url) => {
    const baseKey = getImageBaseKey(url);
    if (baseKeyToLocal[baseKey]) {
      return `src="./${baseKeyToLocal[baseKey]}"`;
    }
    return match;
  });

  // Match markdown link URLs that point to images: [text](image-url)
  // This handles cases like [![img](small.png)](large.png) where large.png should be rewritten
  result = result.replace(/\]\(([^)]+)\)/g, (match, url) => {
    // Only rewrite if it looks like an image URL
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) {
      const baseKey = getImageBaseKey(url);
      if (baseKeyToLocal[baseKey]) {
        return `](./${baseKeyToLocal[baseKey]})`;
      }
    }
    return match;
  });

  // Match YAML front matter image URLs: featured_image: "url"
  result = result.replace(/(featured_image(?:_[a-z]+)?:\s*)"([^"]+)"/gi, (match, prefix, url) => {
    // Only rewrite if it looks like an image URL
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) {
      const baseKey = getImageBaseKey(url);
      if (baseKeyToLocal[baseKey]) {
        return `${prefix}"./${baseKeyToLocal[baseKey]}"`;
      }
    }
    return match;
  });

  return result;
}

/**
 * Save images sidecar file tracking downloaded images
 *
 * Creates a sidecar file that is compatible with the publish command.
 * The format matches what publish expects so fetched articles can be
 * re-published without re-uploading images that already exist on WordPress.
 *
 * @param {string} mdPath - Path to markdown file
 * @param {Object} urlToLocal - Map of original URL to local filename
 * @param {Object} results - Download results
 * @param {string} siteUrl - WordPress site URL (e.g., "https://rajiv.com")
 * @param {string} contentDir - Directory containing the downloaded images
 * @returns {string} Path to sidecar file
 */
function saveImagesSidecar(mdPath, urlToLocal, results, siteUrl, contentDir) {
  const sidecarPath = mdPath.replace(/\.md$/, '.images.json');

  // Build the "uploaded" object in the format that publish expects
  // Key: local path (e.g., "./image.png")
  // Value: { url, hash, uploadedAt } - mediaId is unknown for fetched images
  const uploaded = {};

  for (const [originalUrl, filename] of Object.entries(urlToLocal)) {
    const localPath = `./${filename}`;
    const absolutePath = path.join(contentDir, filename);

    // Compute hash for change detection
    let hash = null;
    if (fs.existsSync(absolutePath)) {
      const content = fs.readFileSync(absolutePath);
      hash = crypto.createHash('md5').update(content).digest('hex');
    }

    // Convert CDN URL back to WordPress URL for reuse during publish
    // WordPress/Jetpack CDN URLs look like: https://i0.wp.com/rajiv.com/wp-content/uploads/...
    // We need to extract the wp-content path and construct the direct URL
    const wpUrl = normalizeWordPressImageUrl(originalUrl, siteUrl);

    uploaded[localPath] = {
      url: wpUrl,
      hash: hash,
      uploadedAt: new Date().toISOString()
      // Note: mediaId is not available when fetching - publish will use URL matching
    };
  }

  const sidecar = {
    site: siteUrl,
    lastUpdated: new Date().toISOString(),
    uploaded: uploaded
  };

  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  return sidecarPath;
}

/**
 * Normalize a WordPress/Jetpack CDN image URL to the direct WordPress URL
 *
 * WordPress images can be served through various CDNs:
 * - Jetpack: https://i0.wp.com/rajiv.com/wp-content/uploads/2023/10/image.png?resize=1024x768
 * - Direct: https://rajiv.com/wp-content/uploads/2023/10/image.png
 *
 * This function extracts the canonical WordPress URL for use during publish.
 *
 * @param {string} cdnUrl - The CDN or direct URL
 * @param {string} siteUrl - The WordPress site URL
 * @returns {string} Normalized WordPress URL
 */
function normalizeWordPressImageUrl(cdnUrl, siteUrl) {
  try {
    const urlObj = new URL(cdnUrl);

    // Check if this is a Jetpack CDN URL (i0.wp.com, i1.wp.com, i2.wp.com)
    if (urlObj.hostname.match(/^i\d\.wp\.com$/)) {
      // Extract the path after the CDN host
      // Format: https://i0.wp.com/rajiv.com/wp-content/uploads/...
      const pathParts = urlObj.pathname.split('/');
      // First part is empty, second part is the domain (rajiv.com)
      // Rest is the actual path (/wp-content/uploads/...)
      if (pathParts.length > 2) {
        const wpPath = '/' + pathParts.slice(2).join('/');
        // Remove query string (size params like ?resize=, ?w=, ?fit=)
        return `${siteUrl}${wpPath}`;
      }
    }

    // Not a CDN URL - just strip query params and return
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch {
    // If URL parsing fails, return as-is
    return cdnUrl;
  }
}

/**
 * Generate enriched YAML front matter from normalized API response
 *
 * @param {Object} normalized - Normalized WordPress post data
 * @param {string} [type='posts'] - Content type ('posts' or 'pages')
 * @returns {string} YAML front matter block
 */
function generateEnrichedFrontMatter(normalized, type = 'posts') {
  const lines = ['---'];

  // Basic metadata
  if (normalized.title) {
    lines.push(`title: "${normalized.title.replace(/"/g, '\\"')}"`);
  }
  if (normalized.slug) {
    lines.push(`slug: "${normalized.slug}"`);
  }
  if (normalized.date) {
    lines.push(`date: "${normalized.date}"`);
  }
  if (normalized.modified && normalized.modified !== normalized.date) {
    lines.push(`modified: "${normalized.modified}"`);
  }
  if (normalized.excerpt) {
    // Clean and truncate excerpt for front matter
    const cleanExcerpt = cleanText(normalized.excerpt.replace(/<[^>]*>/g, '')).substring(0, 300);
    lines.push(`description: "${cleanExcerpt.replace(/"/g, '\\"')}"`);
  }
  if (normalized.link) {
    lines.push(`canonical_url: "${normalized.link}"`);
  }

  // Categories as array
  if (normalized.categories && normalized.categories.length > 0) {
    lines.push('categories:');
    for (const cat of normalized.categories) {
      lines.push(`  - "${cat.name}"`);
    }
  }

  // Tags as array
  if (normalized.tags && normalized.tags.length > 0) {
    lines.push('tags:');
    for (const tag of normalized.tags) {
      lines.push(`  - "${tag.name}"`);
    }
  }

  // Author
  if (normalized.author && normalized.author.name) {
    lines.push(`author: "${normalized.author.name}"`);
  }

  // Content type (page vs post) - critical for publish safeguard
  if (type === 'pages') {
    lines.push('type: page');
  }

  // Featured image
  if (normalized.featuredImage) {
    lines.push(`featured_image: "${normalized.featuredImage.url}"`);
    if (normalized.featuredImage.alt) {
      lines.push(`featured_image_alt: "${normalized.featuredImage.alt.replace(/"/g, '\\"')}"`);
    }
  }

  // WordPress sync metadata (nested)
  lines.push('wordpress:');
  lines.push(`  post_id: ${normalized.id}`);
  if (normalized.categories && normalized.categories.length > 0) {
    lines.push(`  category_ids: [${normalized.categories.map(c => c.id).join(', ')}]`);
  }
  if (normalized.tags && normalized.tags.length > 0) {
    lines.push(`  tag_ids: [${normalized.tags.map(t => t.id).join(', ')}]`);
  }
  if (normalized.author && normalized.author.id) {
    lines.push(`  author_id: ${normalized.author.id}`);
  }
  lines.push(`  synced_at: "${new Date().toISOString()}"`);

  lines.push('---');
  return lines.join('\n');
}

/**
 * Save JSON sidecar file with complete API response
 *
 * @param {string} mdPath - Path to markdown file
 * @param {Object} raw - Raw WordPress API response
 * @param {Object} normalized - Normalized post data
 * @param {string} sourceUrl - Original source URL
 */
function saveJsonSidecar(mdPath, raw, normalized, sourceUrl) {
  const jsonPath = mdPath.replace(/\.md$/, '.json');
  const pkg = require('../package.json');

  const sidecar = {
    _meta: {
      fetchedAt: new Date().toISOString(),
      ownwordsVersion: pkg.version,
      sourceUrl: sourceUrl
    },
    raw: raw,
    normalized: normalized
  };

  fs.writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2));
  return jsonPath;
}

/**
 * Generate date-prefixed filename following Jekyll/Hugo conventions
 *
 * @param {string} slug - Article slug
 * @param {string} date - ISO date string (e.g., '2025-12-07' or '2025-12-07T15:30:00')
 * @returns {string} Date-prefixed filename (e.g., '2025-12-07-my-article')
 */
function generateDatePrefixedFilename(slug, date) {
  // Extract YYYY-MM-DD from ISO date string
  const datePrefix = date ? date.substring(0, 10) : new Date().toISOString().substring(0, 10);
  return `${datePrefix}-${slug}`;
}

/**
 * Generate hierarchical directory path for content
 *
 * Posts: posts/YYYY/MM/DD-slug/
 * Pages: pages/parent-slug/child-slug/ (or pages/slug/ for top-level pages)
 *
 * This structure:
 * - Scales for large media companies with thousands of articles
 * - Groups content by year/month for easy archiving
 * - Keeps media files co-located with their article (index.md + images)
 * - Separates posts (time-based content) from pages (evergreen content)
 *
 * @param {string} contentType - 'posts' or 'pages'
 * @param {string} slug - Content slug
 * @param {string} date - ISO date string (for posts)
 * @param {string} parentSlug - Parent page slug (for hierarchical pages)
 * @returns {string} Relative directory path
 */
function generateHierarchicalPath(contentType, slug, date, parentSlug = null) {
  if (contentType === 'pages') {
    // Pages are organized by slug hierarchy, no dates
    if (parentSlug) {
      return path.join('pages', parentSlug, slug);
    }
    return path.join('pages', slug);
  }

  // Posts are organized by date hierarchy: posts/YYYY/MM/DD-slug/
  const dateStr = date ? date.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const [year, month, day] = dateStr.split('-');

  return path.join('posts', year, month, `${day}-${slug}`);
}

/**
 * Fetch a WordPress article via REST API
 *
 * @param {string} urlOrSlug - Article URL or slug
 * @param {string} outputDir - Output directory for markdown/JSON files
 * @param {Object} [options] - Fetch options
 * @param {string} [options.site] - Site alias from config (e.g., 'myblog')
 * @param {string} [options.type='posts'] - Content type ('posts' or 'pages')
 * @param {boolean} [options.silent=false] - Suppress console output
 * @param {boolean} [options.skipSidecar=false] - Don't create JSON sidecar
 * @param {boolean} [options.force=false] - Overwrite existing files
 * @param {boolean} [options.noDatePrefix=false] - Don't add date prefix to filename (legacy flat mode)
 * @param {boolean} [options.hierarchical=false] - Use hierarchical directory structure
 * @param {boolean} [options.images=true] - Download images locally (default: true)
 * @returns {Promise<Object>} Fetch result with paths and metadata
 */
async function fetchViaApi(urlOrSlug, outputDir, options = {}) {
  const { type = 'posts', silent = false, skipSidecar = false, force = false, noDatePrefix = false, hierarchical = false, images = true } = options;

  // Determine slug and domain
  let slug, sourceUrl, domain;
  if (urlOrSlug.startsWith('http://') || urlOrSlug.startsWith('https://')) {
    sourceUrl = urlOrSlug;
    slug = extractSlugFromUrl(urlOrSlug);
    domain = extractDomain(urlOrSlug);
  } else {
    slug = urlOrSlug;
    sourceUrl = '';
    domain = '';
  }

  if (!slug) {
    throw new Error('Could not determine slug from input');
  }

  // Get WordPress client
  let siteConfig;

  if (options.site) {
    // Use specified site
    siteConfig = getWordPressSite(options.site);
    if (!siteConfig) {
      throw new Error(`Site "${options.site}" not found in config. Run 'ownwords config-wp add ${options.site} <url>' first.`);
    }
  } else if (domain) {
    // Try to find site by domain
    siteConfig = findSiteByDomain(domain);
    if (!siteConfig) {
      throw new Error(
        `No WordPress site configured for ${domain}.\n` +
        `Run 'ownwords config-wp add <alias> https://${domain}' to configure.`
      );
    }
  } else {
    // Use default site
    siteConfig = getWordPressSite();
    if (!siteConfig) {
      throw new Error(
        'No default WordPress site configured.\n' +
        "Run 'ownwords config-wp add <alias> <url> --default' to configure."
      );
    }
  }

  const client = new WpClient({
    url: siteConfig.url,
    username: siteConfig.username,
    appPassword: siteConfig.appPassword
  });

  if (!silent) {
    console.log(`Fetching via API: ${slug} (${type})`);
  }

  // Fetch with embedded data
  const raw = await client.getPostBySlugWithEmbed(slug, type);

  if (!raw) {
    throw new Error(`Post not found: ${slug}`);
  }

  // Normalize the response
  const normalized = client.normalizeEmbedResponse(raw);

  // Update sourceUrl if we didn't have it
  if (!sourceUrl && normalized.link) {
    sourceUrl = normalized.link;
  }

  // Convert HTML content to markdown
  let markdownContent = htmlToMarkdown(normalized.content);

  // Generate enriched front matter (will be updated if images are downloaded)
  // Pass type to include 'type: page' in frontmatter for pages
  let frontMatter = generateEnrichedFrontMatter(normalized, type);

  // Determine output path based on mode
  let mdPath, contentDir;

  if (hierarchical) {
    // Hierarchical mode: posts/YYYY/MM/DD-slug/index.md or pages/slug/index.md
    const relativePath = generateHierarchicalPath(type, slug, normalized.date);
    contentDir = path.join(outputDir, relativePath);
    mdPath = path.join(contentDir, 'index.md');
  } else {
    // Legacy flat mode: outputDir/YYYY-MM-DD-slug.md or outputDir/slug.md
    contentDir = outputDir;
    const filename = noDatePrefix ? slug : generateDatePrefixedFilename(slug, normalized.date);
    mdPath = path.join(outputDir, `${filename}.md`);
  }

  // Ensure output directory exists
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  // Check for existing file (collision detection)
  if (fs.existsSync(mdPath) && !force) {
    throw new Error(`File already exists: ${mdPath}. Use --force to overwrite.`);
  }

  // Download images if enabled (default: true)
  let imagesSidecarPath = null;
  let imageResults = null;
  let featuredImageLocalPath = null;
  if (images) {
    // Extract image URLs from both HTML (more comprehensive) and markdown
    const htmlImageUrls = extractImageUrls(normalized.content);
    const mdImageUrls = extractImageUrlsFromMarkdown(markdownContent);

    // Combine and deduplicate
    const allImageUrls = [...new Set([...htmlImageUrls, ...mdImageUrls])];

    // Add featured image URL if present (for download alongside content images)
    if (normalized.featuredImage && normalized.featuredImage.url) {
      allImageUrls.push(normalized.featuredImage.url);
    }

    if (allImageUrls.length > 0) {
      if (!silent) {
        console.log(`  📷 Found ${allImageUrls.length} images to download...`);
      }

      // Download images to the content directory (co-located with markdown)
      const { urlToLocal, results } = await downloadImages(allImageUrls, contentDir, { silent });
      imageResults = results;

      if (!silent) {
        const parts = [];
        if (results.downloaded > 0) parts.push(`${results.downloaded} downloaded`);
        if (results.skipped > 0) parts.push(`${results.skipped} unchanged`);
        if (results.failed > 0) parts.push(`${results.failed} failed`);
        console.log(`  📷 Images: ${parts.join(', ')}${results.totalSize > 0 ? `, ${(results.totalSize / 1024).toFixed(1)} KB total` : ''}`);
      }

      // Rewrite image URLs in markdown and front matter to use local paths
      if (Object.keys(urlToLocal).length > 0) {
        markdownContent = rewriteImageUrls(markdownContent, urlToLocal);
        frontMatter = rewriteImageUrls(frontMatter, urlToLocal);

        // Track featured image local path if it was downloaded
        if (normalized.featuredImage && normalized.featuredImage.url) {
          const featuredBaseKey = getImageBaseKey(normalized.featuredImage.url);
          for (const [origUrl, localFilename] of Object.entries(urlToLocal)) {
            if (getImageBaseKey(origUrl) === featuredBaseKey) {
              featuredImageLocalPath = `./${localFilename}`;
              break;
            }
          }
        }

        // Save images sidecar (with publish-compatible format)
        imagesSidecarPath = saveImagesSidecar(mdPath, urlToLocal, results, siteConfig.url, contentDir);
        if (!silent) {
          console.log(`  Saved: ${imagesSidecarPath}`);
        }
      }
    } else if (!silent) {
      console.log(`  📷 No images found in article`);
    }
  }

  // Combine into full markdown (after image URL rewriting)
  const fullMarkdown = `${frontMatter}\n\n${markdownContent}\n`;

  fs.writeFileSync(mdPath, fullMarkdown);

  if (!silent) {
    console.log(`  Saved: ${mdPath} (${(fullMarkdown.length / 1024).toFixed(1)} KB)`);
  }

  // Write JSON sidecar
  let jsonPath = null;
  if (!skipSidecar) {
    jsonPath = saveJsonSidecar(mdPath, raw, normalized, sourceUrl);
    if (!silent) {
      console.log(`  Saved: ${jsonPath}`);
    }
  }

  return {
    slug: normalized.slug,
    contentDir: hierarchical ? contentDir : null,
    title: normalized.title,
    date: normalized.date,
    type,
    mdPath,
    jsonPath,
    imagesSidecarPath,
    featuredImageLocalPath,
    imagesDownloaded: imageResults ? imageResults.downloaded : 0,
    imagesSkipped: imageResults ? imageResults.skipped : 0,
    imagesFailed: imageResults ? imageResults.failed : 0,
    wordCount: markdownContent.split(/\s+/).filter(w => w.length > 0).length,
    categories: normalized.categories.map(c => c.name),
    tags: normalized.tags.map(t => t.name),
    author: normalized.author.name
  };
}

/**
 * Fetch multiple WordPress articles via REST API
 *
 * @param {string[]} urlsOrSlugs - Array of URLs or slugs
 * @param {string} outputDir - Output directory
 * @param {Object} [options] - Fetch options (same as fetchViaApi)
 * @returns {Promise<Object>} Batch result with success/failure counts
 */
async function fetchViaApiMultiple(urlsOrSlugs, outputDir, options = {}) {
  const results = {
    total: urlsOrSlugs.length,
    success: 0,
    failed: 0,
    articles: [],
    errors: []
  };

  for (const urlOrSlug of urlsOrSlugs) {
    try {
      const result = await fetchViaApi(urlOrSlug, outputDir, options);
      results.articles.push(result);
      results.success++;
    } catch (error) {
      results.errors.push({
        input: urlOrSlug,
        error: error.message
      });
      results.failed++;
      if (!options.silent) {
        console.error(`  Error: ${urlOrSlug} - ${error.message}`);
      }
    }
  }

  return results;
}

module.exports = {
  fetchViaApi,
  fetchViaApiMultiple,
  extractSlugFromUrl,
  extractDomain,
  findSiteByDomain,
  generateEnrichedFrontMatter,
  generateDatePrefixedFilename,
  generateHierarchicalPath,
  saveJsonSidecar,
  // Image handling exports
  extractImageUrls,
  extractImageUrlsFromMarkdown,
  downloadImages,
  downloadImage,
  getRemoteHeaders,
  rewriteImageUrls,
  saveImagesSidecar,
  deduplicateImageUrls,
  urlToFilename,
  normalizeWordPressImageUrl,
  getImageBaseKey
};
