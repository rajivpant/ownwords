/**
 * @fileoverview Agent-friendly API for AI-assisted editorial tasks
 * @module ownwords/agent-api
 *
 * This module provides batch operations designed for AI coding assistants
 * (Claude, Cursor, etc.) to perform editorial tasks on markdown content.
 *
 * Use cases:
 * - Batch terminology updates across all articles
 * - Link migration (old domain to new domain)
 * - Front matter updates
 * - Content validation
 */

const fs = require('fs');
const path = require('path');
const { verifyConversion } = require('./verify');

/**
 * Agent API for batch editorial operations on markdown content
 */
class AgentAPI {
  /**
   * Create an AgentAPI instance
   *
   * @param {string} contentDir - Directory containing markdown articles
   * @param {Object} [options] - Configuration options
   * @param {string} [options.rawDir] - Directory containing original HTML (for verification)
   * @param {string} [options.pattern] - Glob pattern for markdown files (default: '*.md')
   *
   * @example
   * const agent = new AgentAPI('./content/articles/', {
   *   rawDir: './raw'
   * });
   */
  constructor(contentDir, options = {}) {
    this.contentDir = contentDir;
    this.rawDir = options.rawDir || null;
    this.pattern = options.pattern || '*.md';
  }

  /**
   * List all articles in the content directory
   *
   * @returns {Object[]} Array of article metadata
   *
   * @example
   * const articles = agent.listArticles();
   * // [{ slug: 'my-article', path: './content/articles/my-article.md', title: '...', date: '...' }]
   */
  listArticles() {
    const files = fs.readdirSync(this.contentDir)
      .filter(f => f.endsWith('.md'));

    return files.map(file => {
      const filePath = path.join(this.contentDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const metadata = this._extractFrontMatter(content);

      return {
        slug: path.basename(file, '.md'),
        path: filePath,
        ...metadata
      };
    });
  }

  /**
   * Get a single article by slug
   *
   * @param {string} slug - Article slug
   * @returns {Object|null} Article data or null if not found
   *
   * @example
   * const article = agent.getArticle('my-article');
   * console.log(article.content);
   */
  getArticle(slug) {
    const filePath = path.join(this.contentDir, `${slug}.md`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = this._extractFrontMatter(content);
    const body = content.replace(/^---[\s\S]*?---\n*/m, '');

    return {
      slug,
      path: filePath,
      fullContent: content,
      body,
      ...metadata
    };
  }

  /**
   * Find and replace text across all articles
   *
   * @param {Object} options - Find and replace options
   * @param {string|RegExp} options.pattern - Text or regex pattern to find
   * @param {string|Function} options.replacement - Replacement text or function
   * @param {boolean} [options.dryRun=false] - If true, don't actually modify files
   * @param {boolean} [options.includesFrontMatter=false] - Also search in front matter
   * @returns {Object[]} Array of changes made
   *
   * @example
   * // Simple text replacement
   * const changes = await agent.findAndReplace({
   *   pattern: 'Claude AI',
   *   replacement: 'Claude',
   *   dryRun: true
   * });
   *
   * @example
   * // Regex replacement
   * const changes = await agent.findAndReplace({
   *   pattern: /\bAI\b/g,
   *   replacement: 'artificial intelligence'
   * });
   */
  findAndReplace(options) {
    const { pattern, replacement, dryRun = false, includesFrontMatter = false } = options;

    const regex = typeof pattern === 'string'
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      : pattern;

    const files = this.listArticles();
    const changes = [];

    for (const article of files) {
      const content = fs.readFileSync(article.path, 'utf-8');
      const searchContent = content;

      // Optionally exclude front matter from search
      if (!includesFrontMatter) {
        const frontMatterMatch = content.match(/^(---[\s\S]*?---\n)/m);
        if (frontMatterMatch) {
          const frontMatter = frontMatterMatch[1];
          const body = content.substring(frontMatter.length);
          const newBody = body.replace(regex, replacement);

          if (body !== newBody) {
            const matches = body.match(regex) || [];
            changes.push({
              slug: article.slug,
              path: article.path,
              matchCount: matches.length,
              matches: matches.slice(0, 5) // First 5 matches for preview
            });

            if (!dryRun) {
              fs.writeFileSync(article.path, frontMatter + newBody);
            }
          }
          continue;
        }
      }

      // Search entire content
      const newContent = searchContent.replace(regex, replacement);
      if (content !== newContent) {
        const matches = content.match(regex) || [];
        changes.push({
          slug: article.slug,
          path: article.path,
          matchCount: matches.length,
          matches: matches.slice(0, 5)
        });

        if (!dryRun) {
          fs.writeFileSync(article.path, newContent);
        }
      }
    }

    return changes;
  }

  /**
   * Update links across all articles (domain migration)
   *
   * @param {Object} options - Link update options
   * @param {string} options.oldDomain - Old domain to replace
   * @param {string} options.newDomain - New domain
   * @param {boolean} [options.dryRun=false] - If true, don't actually modify files
   * @returns {Object[]} Array of changes made
   *
   * @example
   * const changes = await agent.updateLinks({
   *   oldDomain: 'old-site.com',
   *   newDomain: 'new-site.com',
   *   dryRun: true
   * });
   */
  updateLinks(options) {
    const { oldDomain, newDomain, dryRun = false } = options;

    // Create patterns for various link formats
    const patterns = [
      // Markdown links
      { regex: new RegExp(`\\]\\(https?://${oldDomain.replace(/\./g, '\\.')}`, 'g'), replacement: `](https://${newDomain}` },
      // Bare URLs
      { regex: new RegExp(`https?://${oldDomain.replace(/\./g, '\\.')}`, 'g'), replacement: `https://${newDomain}` }
    ];

    const files = this.listArticles();
    const changes = [];

    for (const article of files) {
      const content = fs.readFileSync(article.path, 'utf-8');
      let newContent = content;
      let totalMatches = 0;

      for (const { regex, replacement } of patterns) {
        const matches = newContent.match(regex) || [];
        totalMatches += matches.length;
        newContent = newContent.replace(regex, replacement);
      }

      if (content !== newContent) {
        changes.push({
          slug: article.slug,
          path: article.path,
          linkCount: totalMatches
        });

        if (!dryRun) {
          fs.writeFileSync(article.path, newContent);
        }
      }
    }

    return changes;
  }

  /**
   * Update front matter fields across all articles
   *
   * @param {Object} options - Front matter update options
   * @param {Object} options.updates - Key-value pairs to update
   * @param {Function} [options.filter] - Optional filter function (article) => boolean
   * @param {boolean} [options.dryRun=false] - If true, don't actually modify files
   * @returns {Object[]} Array of changes made
   *
   * @example
   * // Add a field to all articles
   * const changes = await agent.updateFrontMatter({
   *   updates: { author: 'Rajiv Pant' },
   *   dryRun: true
   * });
   *
   * @example
   * // Update specific articles
   * const changes = await agent.updateFrontMatter({
   *   updates: { category: 'Core Series' },
   *   filter: (article) => article.slug.includes('synthesis-coding')
   * });
   */
  updateFrontMatter(options) {
    const { updates, filter, dryRun = false } = options;

    const files = this.listArticles();
    const changes = [];

    for (const article of files) {
      // Apply filter if provided
      if (filter && !filter(article)) {
        continue;
      }

      const content = fs.readFileSync(article.path, 'utf-8');
      const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/m);

      if (!frontMatterMatch) {
        continue;
      }

      const frontMatter = frontMatterMatch[1];
      const body = content.substring(frontMatterMatch[0].length);
      let newFrontMatter = frontMatter;
      const updatedFields = [];

      for (const [key, value] of Object.entries(updates)) {
        const fieldRegex = new RegExp(`^${key}:.*$`, 'm');
        const formattedValue = typeof value === 'string' ? `"${value}"` : value;
        const newLine = `${key}: ${formattedValue}`;

        if (fieldRegex.test(newFrontMatter)) {
          // Update existing field
          newFrontMatter = newFrontMatter.replace(fieldRegex, newLine);
          updatedFields.push({ field: key, action: 'updated', value });
        } else {
          // Add new field
          newFrontMatter = newFrontMatter.trimEnd() + '\n' + newLine;
          updatedFields.push({ field: key, action: 'added', value });
        }
      }

      if (updatedFields.length > 0) {
        changes.push({
          slug: article.slug,
          path: article.path,
          fields: updatedFields
        });

        if (!dryRun) {
          const newContent = `---\n${newFrontMatter}\n---${body}`;
          fs.writeFileSync(article.path, newContent);
        }
      }
    }

    return changes;
  }

  /**
   * Validate all articles
   *
   * @param {Object} [options] - Validation options
   * @param {boolean} [options.strict=false] - Treat warnings as errors
   * @returns {Object} Validation results
   *
   * @example
   * const results = await agent.validateAll();
   * console.log(`${results.passed} of ${results.total} articles passed validation`);
   */
  validateAll(options = {}) {
    const files = this.listArticles();
    const results = {
      total: files.length,
      passed: 0,
      failed: 0,
      warnings: 0,
      articles: []
    };

    for (const article of files) {
      const articleResult = {
        slug: article.slug,
        issues: [],
        warnings: []
      };

      // Validate front matter
      const content = fs.readFileSync(article.path, 'utf-8');
      const { validateFrontMatter, validateMarkdownStructure } = require('./verify');

      const frontMatterCheck = validateFrontMatter(content);
      articleResult.issues.push(...frontMatterCheck.issues);
      articleResult.warnings.push(...frontMatterCheck.warnings);

      const structureCheck = validateMarkdownStructure(content);
      articleResult.issues.push(...structureCheck.issues);
      articleResult.warnings.push(...structureCheck.warnings);

      // If we have raw HTML, do full verification
      if (this.rawDir) {
        const htmlPath = path.join(this.rawDir, `${article.slug}.html`);
        if (fs.existsSync(htmlPath)) {
          const verification = verifyConversion(htmlPath, article.path, options);
          articleResult.issues.push(...verification.issues);
          articleResult.warnings.push(...verification.warnings);
        }
      }

      // Tally results
      if (articleResult.issues.length > 0) {
        results.failed++;
      } else if (articleResult.warnings.length > 0) {
        results.warnings++;
        results.passed++;
      } else {
        results.passed++;
      }

      results.articles.push(articleResult);
    }

    return results;
  }

  /**
   * Search for articles containing specific text
   *
   * @param {string|RegExp} query - Search query
   * @param {Object} [options] - Search options
   * @param {boolean} [options.includeBody=true] - Search in article body
   * @param {boolean} [options.includeFrontMatter=false] - Search in front matter
   * @returns {Object[]} Array of matching articles with context
   *
   * @example
   * const matches = agent.search('synthesis coding');
   * // Returns articles containing 'synthesis coding' with match context
   */
  search(query, options = {}) {
    const { includeBody = true, includeFrontMatter = false } = options;

    const regex = typeof query === 'string'
      ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      : query;

    const files = this.listArticles();
    const matches = [];

    for (const article of files) {
      const content = fs.readFileSync(article.path, 'utf-8');
      const frontMatterMatch = content.match(/^(---[\s\S]*?---\n)/m);
      const frontMatter = frontMatterMatch ? frontMatterMatch[1] : '';
      const body = content.substring(frontMatter.length);

      const searchContent = [
        includeFrontMatter ? frontMatter : '',
        includeBody ? body : ''
      ].join('');

      const contentMatches = searchContent.match(regex);
      if (contentMatches && contentMatches.length > 0) {
        // Get context around first match
        const firstIndex = searchContent.search(regex);
        const start = Math.max(0, firstIndex - 50);
        const end = Math.min(searchContent.length, firstIndex + 100);
        const context = searchContent.substring(start, end).replace(/\n/g, ' ');

        matches.push({
          slug: article.slug,
          path: article.path,
          title: article.title,
          matchCount: contentMatches.length,
          context: `...${context}...`
        });
      }
    }

    return matches;
  }

  /**
   * Extract front matter from markdown content
   * @private
   */
  _extractFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/m);
    if (!match) return {};

    const frontMatter = match[1];
    const metadata = {};

    const lines = frontMatter.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        // Remove quotes
        value = value.replace(/^["']|["']$/g, '');
        metadata[key] = value;
      }
    }

    return metadata;
  }
}

module.exports = { AgentAPI };
