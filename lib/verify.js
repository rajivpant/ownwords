/**
 * @fileoverview Independent QA verification for WordPress to Markdown conversion
 * @module ownwords/verify
 *
 * This module is intentionally independent from the conversion module.
 * It uses its own extraction logic to catch conversion bugs.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// TEXT EXTRACTION (Independent implementations)
// ============================================================================

/**
 * Decode HTML entities to plain text
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
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
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"');
}

/**
 * Extract plain text from HTML for comparison
 *
 * Uses a different approach than the converter to catch conversion bugs.
 *
 * @param {string} html - Full WordPress page HTML
 * @returns {string} Extracted plain text
 */
function extractTextFromHtml(html) {
  let text = html;

  // Remove non-content sections first
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Try to find article content - multiple strategies
  let articleContent = text;

  // Strategy 1: entry-content div
  const entryMatch = text.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="sharedaddy|<footer|<nav|<div class="wp-block-comments|$)/i);
  if (entryMatch) {
    articleContent = entryMatch[1];
  } else {
    // Strategy 2: article tag
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      articleContent = articleMatch[1];
    } else {
      // Strategy 3: main tag
      const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      if (mainMatch) {
        articleContent = mainMatch[1];
      }
    }
  }

  // Remove sharing widgets and comments
  articleContent = articleContent.replace(/<div[^>]*class="[^"]*sharedaddy[^"]*"[^>]*>[\s\S]*$/gi, '');
  articleContent = articleContent.replace(/<div[^>]*class="[^"]*wp-block-comments[^"]*"[^>]*>[\s\S]*$/gi, '');

  // Strip HTML tags
  articleContent = articleContent.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  articleContent = decodeHtmlEntities(articleContent);

  // Normalize whitespace
  articleContent = articleContent.replace(/\s+/g, ' ').trim();

  return articleContent;
}

/**
 * Extract plain text from Markdown for comparison
 *
 * @param {string} markdown - Markdown content
 * @returns {string} Extracted plain text
 */
function extractTextFromMarkdown(markdown) {
  let text = markdown;

  // Remove front matter
  text = text.replace(/^---[\s\S]*?---\n*/m, '');

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`[^`]+`/g, ' ');

  // Remove image syntax
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');

  // Remove link URLs but keep link text
  text = text.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove markdown formatting
  text = text.replace(/^#{1,6}\s*/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/^>\s*/gm, '');
  text = text.replace(/^[-*+]\s*/gm, '');
  text = text.replace(/^\d+\.\s*/gm, '');
  text = text.replace(/^---+$/gm, '');

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// ============================================================================
// ELEMENT EXTRACTION
// ============================================================================

/**
 * Extract all headings from HTML
 *
 * @param {string} html - HTML content
 * @returns {Array<{level: number, text: string}>} Extracted headings
 */
function extractHeadingsFromHtml(html) {
  const headings = [];
  const pattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const level = parseInt(match[1]);
    let text = match[2].replace(/<[^>]+>/g, '').trim();
    text = decodeHtmlEntities(text);
    if (text) {
      headings.push({ level, text });
    }
  }
  return headings;
}

/**
 * Extract all headings from Markdown
 *
 * @param {string} markdown - Markdown content
 * @returns {Array<{level: number, text: string}>} Extracted headings
 */
function extractHeadingsFromMarkdown(markdown) {
  const headings = [];
  const content = markdown.replace(/^---[\s\S]*?---\n*/m, '');
  const pattern = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].replace(/\*\*/g, '').replace(/\*/g, '').trim()
    });
  }
  return headings;
}

/**
 * Check if URL is article content (not navigation/WordPress internals)
 * @private
 */
function isContentUrl(url) {
  if (!url || url.startsWith('#')) return false;

  const skipPatterns = [
    'wp-content/themes',
    'wp-content/plugins',
    'wp-json',
    '/feed/',
    '/comments/',
    '/trackback/',
    '?share=',
    '?replytocom=',
    '/page/',
    '/category/',
    '/tag/',
    '/author/',
    'wp-login',
    'xmlrpc.php'
  ];

  return !skipPatterns.some(pattern => url.includes(pattern));
}

/**
 * Extract all URLs from HTML
 *
 * @param {string} html - HTML content
 * @returns {Map<string, string>} Map of URL to link text
 */
function extractUrlsFromHtml(html) {
  const urls = new Map();
  const hrefPattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = hrefPattern.exec(html)) !== null) {
    const url = match[1];
    const linkText = match[2].replace(/<[^>]+>/g, '').trim();
    if (isContentUrl(url)) {
      urls.set(url, linkText);
    }
  }
  return urls;
}

/**
 * Extract all URLs from Markdown
 *
 * @param {string} markdown - Markdown content
 * @returns {Map<string, string>} Map of URL to link text
 */
function extractUrlsFromMarkdown(markdown) {
  const urls = new Map();
  const content = markdown.replace(/^---[\s\S]*?---\n*/m, '');
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    urls.set(match[2], match[1]);
  }
  return urls;
}

/**
 * Extract images from HTML
 *
 * @param {string} html - HTML content
 * @returns {string[]} Array of image URLs
 */
function extractImagesFromHtml(html) {
  const images = [];
  const pattern = /<img[^>]*src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const src = match[1];
    if (!src.includes('wp-content/themes') && !src.includes('wp-content/plugins')) {
      images.push(src);
    }
  }
  return images;
}

/**
 * Extract images from Markdown
 *
 * @param {string} markdown - Markdown content
 * @returns {string[]} Array of image URLs
 */
function extractImagesFromMarkdown(markdown) {
  const images = [];
  const content = markdown.replace(/^---[\s\S]*?---\n*/m, '');
  const pattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    images.push(match[1]);
  }
  return images;
}

/**
 * Extract code blocks from HTML
 *
 * @param {string} html - HTML content
 * @returns {string[]} Array of code block snippets (first 100 chars each)
 */
function extractCodeFromHtml(html) {
  const codeBlocks = [];
  const prePattern = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
  let match;
  while ((match = prePattern.exec(html)) !== null) {
    let code = match[1].replace(/<[^>]+>/g, '');
    code = decodeHtmlEntities(code).trim();
    if (code.length > 10) {
      codeBlocks.push(code.substring(0, 100));
    }
  }
  return codeBlocks;
}

/**
 * Extract code blocks from Markdown
 *
 * @param {string} markdown - Markdown content
 * @returns {string[]} Array of code block snippets (first 100 chars each)
 */
function extractCodeFromMarkdown(markdown) {
  const codeBlocks = [];
  const content = markdown.replace(/^---[\s\S]*?---\n*/m, '');
  const pattern = /```[\w]*\n([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const code = match[1].trim();
    if (code.length > 10) {
      codeBlocks.push(code.substring(0, 100));
    }
  }
  return codeBlocks;
}

/**
 * Extract list items from HTML
 *
 * @param {string} html - HTML content
 * @returns {string[]} Array of list item text snippets
 */
function extractListItemsFromHtml(html) {
  const items = [];
  const pattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let text = match[1].replace(/<[^>]+>/g, ' ').trim();
    text = decodeHtmlEntities(text).replace(/\s+/g, ' ');
    if (text.length > 5) {
      items.push(text.substring(0, 50));
    }
  }
  return items;
}

/**
 * Extract list items from Markdown
 *
 * @param {string} markdown - Markdown content
 * @returns {string[]} Array of list item text snippets
 */
function extractListItemsFromMarkdown(markdown) {
  const items = [];
  const content = markdown.replace(/^---[\s\S]*?---\n*/m, '');
  const pattern = /^[-*+]\s+(.+)$|^\d+\.\s+(.+)$/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const text = (match[1] || match[2]).replace(/\[([^\]]*)\]\([^)]+\)/g, '$1').trim();
    if (text.length > 5) {
      items.push(text.substring(0, 50));
    }
  }
  return items;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate front matter has required fields
 *
 * @param {string} markdown - Full markdown content
 * @returns {{issues: string[], warnings: string[]}} Validation results
 */
function validateFrontMatter(markdown) {
  const issues = [];
  const warnings = [];

  const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/m);
  if (!frontMatterMatch) {
    issues.push('No front matter found');
    return { issues, warnings };
  }

  const frontMatter = frontMatterMatch[1];

  // Required fields
  const requiredFields = ['title', 'slug', 'date', 'canonical_url'];
  for (const field of requiredFields) {
    if (!frontMatter.includes(`${field}:`)) {
      issues.push(`Missing required field: ${field}`);
    }
  }

  // Check for empty values
  const emptyPattern = /^(\w+):\s*["']?\s*["']?\s*$/gm;
  let match;
  while ((match = emptyPattern.exec(frontMatter)) !== null) {
    warnings.push(`Empty value for field: ${match[1]}`);
  }

  // Validate date format (supports both YYYY-MM-DD and full ISO timestamps)
  const dateMatch = frontMatter.match(/date:\s*["']?(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?)["']?/);
  if (dateMatch) {
    const date = new Date(dateMatch[1]);
    if (isNaN(date.getTime())) {
      issues.push(`Invalid date format: ${dateMatch[1]}`);
    }
  }

  // Validate canonical URL format
  const canonicalMatch = frontMatter.match(/canonical_url:\s*["']?(https?:\/\/[^"'\n]+)["']?/);
  if (canonicalMatch) {
    try {
      new URL(canonicalMatch[1]);
    } catch {
      issues.push(`Invalid canonical URL: ${canonicalMatch[1]}`);
    }
  }

  return { issues, warnings };
}

/**
 * Check for malformed markdown structures
 *
 * @param {string} markdown - Full markdown content
 * @returns {{issues: string[], warnings: string[]}} Validation results
 */
function validateMarkdownStructure(markdown) {
  const issues = [];
  const warnings = [];

  const content = markdown.replace(/^---[\s\S]*?---\n*/m, '');

  // Check for unclosed links
  const unclosedLinks = content.match(/\[[^\]]+\]\([^)]*$/gm);
  if (unclosedLinks) {
    issues.push(`Unclosed links found: ${unclosedLinks.length}`);
  }

  // Check for empty links
  const emptyLinks = content.match(/\[[^\]]+\]\(\s*\)/g);
  if (emptyLinks) {
    issues.push(`Empty link URLs: ${emptyLinks.length}`);
  }

  // Check for unclosed code blocks
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    issues.push('Unclosed code block (odd number of ``` markers)');
  }

  // Check for very long lines
  const lines = content.split('\n');
  const longLines = lines.filter(line => line.length > 500);
  if (longLines.length > 0) {
    warnings.push(`Very long lines found: ${longLines.length} (may indicate parsing issues)`);
  }

  // Check for HTML remnants
  const outsideCode = content.replace(/```[\s\S]*?```/g, '');
  const realHtml = outsideCode.match(/<(?!!)(?!--)[a-z][^>]*>/gi);
  if (realHtml && realHtml.length > 0) {
    warnings.push(`HTML tags found outside code blocks: ${realHtml.length}`);
  }

  return { issues, warnings };
}

// ============================================================================
// COMPARISON FUNCTIONS
// ============================================================================

/**
 * Compare word counts between HTML and Markdown
 * @private
 */
function compareWordCounts(htmlText, mdText) {
  const htmlWords = htmlText.split(/\s+/).filter(w => w.length > 0);
  const mdWords = mdText.split(/\s+/).filter(w => w.length > 0);

  const diff = Math.abs(htmlWords.length - mdWords.length);
  const percentDiff = htmlWords.length > 0
    ? ((diff / htmlWords.length) * 100).toFixed(1)
    : 0;

  let status = 'OK';
  if (percentDiff > 15) status = 'ERROR';
  else if (percentDiff > 5) status = 'WARNING';

  return {
    htmlWords: htmlWords.length,
    mdWords: mdWords.length,
    diff,
    percentDiff,
    status
  };
}

/**
 * Compare headings between HTML and Markdown
 * @private
 */
function compareHeadings(htmlHeadings, mdHeadings) {
  const issues = [];
  const warnings = [];

  const htmlH2Plus = htmlHeadings.filter(h => h.level >= 2);
  const mdH2Plus = mdHeadings.filter(h => h.level >= 2);

  if (htmlH2Plus.length !== mdH2Plus.length) {
    warnings.push(`Heading count mismatch: HTML=${htmlH2Plus.length}, MD=${mdH2Plus.length}`);
  }

  // Check for missing headings (fuzzy match)
  for (const htmlH of htmlH2Plus) {
    const normalizedHtml = htmlH.text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = mdH2Plus.some(mdH => {
      const normalizedMd = mdH.text.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedMd.includes(normalizedHtml.substring(0, 20)) ||
             normalizedHtml.includes(normalizedMd.substring(0, 20));
    });
    if (!found && htmlH.text.length > 5) {
      issues.push(`Missing heading: "${htmlH.text.substring(0, 50)}..."`);
    }
  }

  return { issues, warnings };
}

/**
 * Compare URLs between HTML and Markdown
 * @private
 */
function compareUrls(htmlUrls, mdUrls) {
  const issues = [];
  const warnings = [];

  const normalizeUrl = url => url.replace(/\/$/, '').toLowerCase();
  const mdUrlsNormalized = new Set([...mdUrls.keys()].map(normalizeUrl));

  const missingUrls = [];
  for (const [url, linkText] of htmlUrls) {
    if (!mdUrlsNormalized.has(normalizeUrl(url))) {
      missingUrls.push({ url, linkText });
    }
  }

  if (missingUrls.length > 0) {
    if (missingUrls.length > 5) {
      issues.push(`Missing ${missingUrls.length} URLs from original`);
    } else {
      warnings.push(`Missing URLs (${missingUrls.length}):`);
    }
    missingUrls.slice(0, 5).forEach(({ url, linkText }) => {
      const display = linkText ? `"${linkText.substring(0, 30)}" -> ${url}` : url;
      (missingUrls.length > 5 ? issues : warnings).push(`  - ${display}`);
    });
  }

  return { issues, warnings };
}

/**
 * Extract significant sentences for spot-checking
 * @private
 */
function extractSentences(text) {
  const sentences = text.split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 200);
  return sentences.filter((_, i) => i % 5 === 0);
}

/**
 * Spot-check sentences between HTML and Markdown
 * @private
 */
function spotCheckSentences(htmlText, mdText) {
  const issues = [];
  const warnings = [];

  const htmlSentences = extractSentences(htmlText);
  const mdTextLower = mdText.toLowerCase();

  let missing = 0;
  for (const sentence of htmlSentences) {
    const words = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    const keyWords = words.slice(0, 5);
    const foundCount = keyWords.filter(w => mdTextLower.includes(w)).length;

    if (foundCount < keyWords.length * 0.6) {
      missing++;
    }
  }

  if (missing > 0 && missing > htmlSentences.length * 0.1) {
    warnings.push(`Sentence spot-check: ${missing}/${htmlSentences.length} sampled sentences may be missing or altered`);
  }

  return { issues, warnings };
}

// ============================================================================
// MAIN VERIFICATION
// ============================================================================

/**
 * Verify a conversion from HTML to Markdown
 *
 * Performs comprehensive QA checks:
 * - Front matter validation (required fields, format)
 * - Markdown structure (unclosed links, code blocks)
 * - Word count comparison (content loss detection)
 * - Heading preservation
 * - URL/link preservation
 * - Image preservation
 * - Code block preservation
 * - List item preservation
 * - Sentence spot-checking
 *
 * @param {string} htmlPath - Path to original HTML file
 * @param {string} mdPath - Path to converted Markdown file
 * @param {Object} [options] - Verification options
 * @param {boolean} [options.strict=false] - Treat warnings as errors
 * @returns {Object} Verification results
 * @returns {string} returns.htmlPath - Path to HTML file
 * @returns {string} returns.mdPath - Path to Markdown file
 * @returns {string[]} returns.issues - Array of error messages
 * @returns {string[]} returns.warnings - Array of warning messages
 * @returns {Object} returns.stats - Statistics (file sizes, word counts)
 * @returns {Object} returns.checks - Detailed check results
 *
 * @example
 * const result = verifyConversion('./raw/article.html', './content/article.md');
 * if (result.issues.length > 0) {
 *   console.error('Conversion has issues:', result.issues);
 * }
 */
function verifyConversion(htmlPath, mdPath, options = {}) {
  const results = {
    htmlPath,
    mdPath,
    issues: [],
    warnings: [],
    stats: {},
    checks: {},
    passed: false
  };

  // Check files exist
  if (!fs.existsSync(htmlPath)) {
    results.issues.push(`HTML file not found: ${htmlPath}`);
    return results;
  }
  if (!fs.existsSync(mdPath)) {
    results.issues.push(`Markdown file not found: ${mdPath}`);
    return results;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  results.stats.htmlSize = html.length;
  results.stats.mdSize = markdown.length;

  // 1. Front matter validation
  const frontMatterCheck = validateFrontMatter(markdown);
  results.checks.frontMatter = frontMatterCheck;
  results.issues.push(...frontMatterCheck.issues);
  results.warnings.push(...frontMatterCheck.warnings);

  // 2. Markdown structure validation
  const structureCheck = validateMarkdownStructure(markdown);
  results.checks.structure = structureCheck;
  results.issues.push(...structureCheck.issues);
  results.warnings.push(...structureCheck.warnings);

  // 3. Text extraction and word count
  const htmlText = extractTextFromHtml(html);
  const mdText = extractTextFromMarkdown(markdown);
  const wordComparison = compareWordCounts(htmlText, mdText);
  results.stats.wordComparison = wordComparison;
  results.checks.wordCount = wordComparison;

  if (wordComparison.status === 'ERROR') {
    results.issues.push(`Word count differs significantly: HTML=${wordComparison.htmlWords}, MD=${wordComparison.mdWords} (${wordComparison.percentDiff}% diff)`);
  } else if (wordComparison.status === 'WARNING') {
    results.warnings.push(`Word count differs: HTML=${wordComparison.htmlWords}, MD=${wordComparison.mdWords} (${wordComparison.percentDiff}% diff)`);
  }

  // 4. Heading comparison
  const htmlHeadings = extractHeadingsFromHtml(html);
  const mdHeadings = extractHeadingsFromMarkdown(markdown);
  const headingCheck = compareHeadings(htmlHeadings, mdHeadings);
  results.checks.headings = { html: htmlHeadings.length, md: mdHeadings.length, ...headingCheck };
  results.issues.push(...headingCheck.issues);
  results.warnings.push(...headingCheck.warnings);

  // 5. URL comparison
  const htmlUrls = extractUrlsFromHtml(html);
  const mdUrls = extractUrlsFromMarkdown(markdown);
  const urlCheck = compareUrls(htmlUrls, mdUrls);
  results.stats.htmlUrls = htmlUrls.size;
  results.stats.mdUrls = mdUrls.size;
  results.checks.urls = { html: htmlUrls.size, md: mdUrls.size, ...urlCheck };
  results.issues.push(...urlCheck.issues);
  results.warnings.push(...urlCheck.warnings);

  // 6. Image comparison
  const htmlImages = extractImagesFromHtml(html);
  const mdImages = extractImagesFromMarkdown(markdown);
  results.checks.images = { html: htmlImages.length, md: mdImages.length };
  if (htmlImages.length > 0 && mdImages.length === 0) {
    results.warnings.push(`Images may be missing: ${htmlImages.length} in HTML, 0 in Markdown`);
  }

  // 7. Code block comparison
  const htmlCode = extractCodeFromHtml(html);
  const mdCode = extractCodeFromMarkdown(markdown);
  results.checks.code = { html: htmlCode.length, md: mdCode.length };
  if (htmlCode.length > 0 && mdCode.length === 0) {
    results.issues.push(`Code blocks lost: ${htmlCode.length} in HTML, 0 in Markdown`);
  } else if (Math.abs(htmlCode.length - mdCode.length) > 2) {
    results.warnings.push(`Code block count mismatch: HTML=${htmlCode.length}, MD=${mdCode.length}`);
  }

  // 8. List item comparison
  const htmlItems = extractListItemsFromHtml(html);
  const mdItems = extractListItemsFromMarkdown(markdown);
  results.checks.lists = { html: htmlItems.length, md: mdItems.length };
  const listDiff = Math.abs(htmlItems.length - mdItems.length);
  if (listDiff > htmlItems.length * 0.2) {
    results.warnings.push(`List item count mismatch: HTML=${htmlItems.length}, MD=${mdItems.length}`);
  }

  // 9. Sentence spot-check
  const sentenceCheck = spotCheckSentences(htmlText, mdText);
  results.checks.sentences = sentenceCheck;
  results.issues.push(...sentenceCheck.issues);
  results.warnings.push(...sentenceCheck.warnings);

  // Set passed flag
  results.passed = results.issues.length === 0;
  if (options.strict) {
    results.passed = results.passed && results.warnings.length === 0;
  }

  return results;
}

/**
 * Verify multiple conversions (batch mode)
 *
 * @param {string} htmlDir - Directory containing HTML files
 * @param {string} mdDir - Directory containing Markdown files
 * @param {Object} [options] - Verification options
 * @returns {Object} Batch verification results
 */
function verifyBatch(htmlDir, mdDir, options = {}) {
  const results = {
    htmlDir,
    mdDir,
    files: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      totalIssues: 0,
      totalWarnings: 0
    }
  };

  if (!fs.existsSync(htmlDir)) {
    results.error = `HTML directory not found: ${htmlDir}`;
    return results;
  }

  const htmlFiles = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
  results.summary.total = htmlFiles.length;

  for (const htmlFile of htmlFiles) {
    const slug = path.basename(htmlFile, '.html');
    const mdFile = `${slug}.md`;

    const verification = verifyConversion(
      path.join(htmlDir, htmlFile),
      path.join(mdDir, mdFile),
      options
    );

    results.files.push({
      slug,
      htmlFile,
      mdFile,
      ...verification
    });

    if (verification.passed) {
      if (verification.warnings.length > 0) {
        results.summary.warnings++;
      } else {
        results.summary.passed++;
      }
    } else {
      results.summary.failed++;
    }

    results.summary.totalIssues += verification.issues.length;
    results.summary.totalWarnings += verification.warnings.length;
  }

  return results;
}

module.exports = {
  verifyConversion,
  verifyBatch,
  validateFrontMatter,
  validateMarkdownStructure,
  extractTextFromHtml,
  extractTextFromMarkdown,
  extractHeadingsFromHtml,
  extractHeadingsFromMarkdown,
  extractUrlsFromHtml,
  extractUrlsFromMarkdown,
  extractImagesFromHtml,
  extractImagesFromMarkdown,
  extractCodeFromHtml,
  extractCodeFromMarkdown,
  extractListItemsFromHtml,
  extractListItemsFromMarkdown,
  decodeHtmlEntities
};
