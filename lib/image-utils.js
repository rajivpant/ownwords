/**
 * @fileoverview Image and metadata utilities for ownwords
 * @module ownwords/image-utils
 *
 * Provides utilities for extracting local image paths from markdown,
 * rewriting image URLs, managing image upload tracking, and
 * updating markdown front matter with WordPress metadata.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');

/**
 * Extract local image paths from markdown content
 *
 * Matches markdown image syntax: ![alt](path)
 * Only extracts local paths (not http:// or https://)
 *
 * @param {string} markdown - Markdown content
 * @param {string} mdDir - Directory containing the markdown file
 * @returns {Array<{markdownPath: string, absolutePath: string, filename: string, altText: string}>}
 */
function extractLocalImages(markdown, mdDir) {
  const images = [];
  // Match ![alt text](path) or ![alt text](path "title") - capture alt text and path (excluding optional title)
  // The title pattern (?:\s+"(?:[^"\\]|\\.)*")? handles escaped quotes like \"
  const imageRegex = /!\[([^\]]*)\]\(([^\s")]+)(?:\s+"(?:[^"\\]|\\.)*")?\)/g;
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const altText = match[1];
    const imagePath = match[2];

    // Skip external URLs
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      continue;
    }

    // Skip data URIs
    if (imagePath.startsWith('data:')) {
      continue;
    }

    // Resolve absolute path
    const absolutePath = path.resolve(mdDir, imagePath);
    const filename = path.basename(imagePath);

    images.push({
      markdownPath: imagePath,
      absolutePath,
      filename,
      altText
    });
  }

  return images;
}

/**
 * Escape special regex characters in a string
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite image paths in HTML content
 *
 * @param {string} html - HTML content
 * @param {Object<string, string>} urlMap - Map of local paths to WordPress URLs
 * @returns {string} HTML with rewritten image paths
 */
function rewriteImageUrls(html, urlMap) {
  let result = html;

  for (const [localPath, wpUrl] of Object.entries(urlMap)) {
    // Escape the local path for use in regex
    const escaped = escapeRegex(localPath);
    // Replace in src attributes (both with and without quotes)
    result = result.replace(new RegExp(`src="${escaped}"`, 'g'), `src="${wpUrl}"`);
    result = result.replace(new RegExp(`src='${escaped}'`, 'g'), `src='${wpUrl}'`);
  }

  return result;
}

/**
 * Calculate file hash for change detection
 *
 * @param {string} filePath - Path to file
 * @returns {string} MD5 hash of file contents
 */
function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Get the sidecar file path for a markdown file
 *
 * @param {string} mdPath - Path to markdown file
 * @returns {string} Path to sidecar JSON file
 */
function getSidecarPath(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath, '.md');
  return path.join(dir, `${basename}.images.json`);
}

/**
 * Load image tracking sidecar file
 *
 * @param {string} mdPath - Path to markdown file
 * @returns {Object|null} Sidecar data or null if not found
 */
function loadSidecar(mdPath) {
  const sidecarPath = getSidecarPath(mdPath);

  if (!fs.existsSync(sidecarPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(sidecarPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Warning: Failed to parse sidecar file: ${error.message}`);
    return null;
  }
}

/**
 * Save image tracking sidecar file
 *
 * @param {string} mdPath - Path to markdown file
 * @param {Object} data - Sidecar data to save
 */
function saveSidecar(mdPath, data) {
  const sidecarPath = getSidecarPath(mdPath);
  fs.writeFileSync(sidecarPath, JSON.stringify(data, null, 2));
}

/**
 * Check which images need to be uploaded
 *
 * Compares local images against sidecar to determine which need uploading.
 * An image needs uploading if:
 * - It's not in the sidecar
 * - Its file hash has changed
 * - The sidecar is for a different site
 *
 * @param {Array} images - Array of image objects from extractLocalImages
 * @param {Object|null} sidecar - Existing sidecar data
 * @param {string} siteName - WordPress site name
 * @returns {Array} Images that need to be uploaded
 */
function getImagesToUpload(images, sidecar, siteName) {
  if (!sidecar || sidecar.site !== siteName) {
    // No sidecar or different site - upload all
    return images;
  }

  const toUpload = [];

  for (const img of images) {
    const existing = sidecar.uploaded?.[img.markdownPath];

    if (!existing) {
      // Not previously uploaded
      toUpload.push(img);
      continue;
    }

    // Check if file has changed
    if (fs.existsSync(img.absolutePath)) {
      const currentHash = getFileHash(img.absolutePath);
      if (existing.hash !== currentHash) {
        toUpload.push(img);
      }
    }
  }

  return toUpload;
}

/**
 * Build URL map from sidecar data
 *
 * @param {Array} images - Array of image objects from extractLocalImages
 * @param {Object|null} sidecar - Existing sidecar data
 * @returns {Object<string, string>} Map of local paths to WordPress URLs
 */
function buildUrlMapFromSidecar(images, sidecar) {
  const urlMap = {};

  if (!sidecar?.uploaded) {
    return urlMap;
  }

  for (const img of images) {
    const existing = sidecar.uploaded[img.markdownPath];
    if (existing?.url) {
      urlMap[img.markdownPath] = existing.url;
    }
  }

  return urlMap;
}

/**
 * Update sidecar with newly uploaded images
 *
 * @param {Object|null} sidecar - Existing sidecar data
 * @param {string} siteName - WordPress site name
 * @param {Array<{localPath: string, absolutePath: string, mediaId: number, url: string}>} uploadedImages - Newly uploaded images
 * @returns {Object} Updated sidecar data
 */
function updateSidecar(sidecar, siteName, uploadedImages) {
  const updated = {
    site: siteName,
    lastUpdated: new Date().toISOString(),
    uploaded: sidecar?.uploaded || {}
  };

  for (const img of uploadedImages) {
    updated.uploaded[img.localPath] = {
      mediaId: img.mediaId,
      url: img.url,
      hash: fs.existsSync(img.absolutePath) ? getFileHash(img.absolutePath) : null,
      uploadedAt: new Date().toISOString()
    };
  }

  return updated;
}

/**
 * Update markdown front matter with WordPress metadata
 *
 * Adds or updates the wordpress section in the front matter with:
 * - post_id: WordPress post ID
 * - category_ids: Array of category IDs
 * - tag_ids: Array of tag IDs
 * - synced_at: ISO timestamp
 *
 * Also updates canonical_url if not already set.
 *
 * @param {string} mdPath - Path to markdown file
 * @param {Object} wpData - WordPress data from publish result
 * @param {number} wpData.postId - WordPress post ID
 * @param {string} wpData.slug - Post slug
 * @param {string} wpData.link - Published URL
 * @param {number[]} [wpData.categories] - Category IDs
 * @param {number[]} [wpData.tags] - Tag IDs
 */
function updateFrontMatterWithWordPress(mdPath, wpData) {
  const content = fs.readFileSync(mdPath, 'utf-8');
  const parsed = matter(content);

  // Update or create wordpress section
  if (!parsed.data.wordpress) {
    parsed.data.wordpress = {};
  }

  parsed.data.wordpress.post_id = wpData.postId;
  parsed.data.wordpress.synced_at = new Date().toISOString();

  if (wpData.categories && wpData.categories.length > 0) {
    parsed.data.wordpress.category_ids = wpData.categories;
  }

  if (wpData.tags && wpData.tags.length > 0) {
    parsed.data.wordpress.tag_ids = wpData.tags;
  }

  // Update canonical_url if not set or different
  if (!parsed.data.canonical_url || parsed.data.canonical_url !== wpData.link) {
    parsed.data.canonical_url = wpData.link;
  }

  // Reconstruct the file with updated front matter
  // Use lineWidth: -1 to prevent YAML block scalar syntax (>-) which leaks into WordPress excerpts
  const output = matter.stringify(parsed.content, parsed.data, { lineWidth: -1 });
  fs.writeFileSync(mdPath, output);
}

/**
 * Read WordPress metadata from front matter
 *
 * @param {string} mdPath - Path to markdown file
 * @returns {Object|null} WordPress metadata or null if not found
 */
function readWordPressMetadata(mdPath) {
  if (!fs.existsSync(mdPath)) {
    return null;
  }

  const content = fs.readFileSync(mdPath, 'utf-8');
  const parsed = matter(content);

  return parsed.data.wordpress || null;
}

module.exports = {
  extractLocalImages,
  escapeRegex,
  rewriteImageUrls,
  getFileHash,
  getSidecarPath,
  loadSidecar,
  saveSidecar,
  getImagesToUpload,
  buildUrlMapFromSidecar,
  updateSidecar,
  updateFrontMatterWithWordPress,
  readWordPressMetadata
};
