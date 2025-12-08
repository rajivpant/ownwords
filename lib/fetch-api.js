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
 * Generate enriched YAML front matter from normalized API response
 *
 * @param {Object} normalized - Normalized WordPress post data
 * @returns {string} YAML front matter block
 */
function generateEnrichedFrontMatter(normalized) {
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
 * @returns {Promise<Object>} Fetch result with paths and metadata
 */
async function fetchViaApi(urlOrSlug, outputDir, options = {}) {
  const { type = 'posts', silent = false, skipSidecar = false, force = false, noDatePrefix = false, hierarchical = false } = options;

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
  const markdownContent = htmlToMarkdown(normalized.content);

  // Generate enriched front matter
  const frontMatter = generateEnrichedFrontMatter(normalized);

  // Combine into full markdown
  const fullMarkdown = `${frontMatter}\n\n${markdownContent}\n`;

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
  saveJsonSidecar
};
