#!/usr/bin/env node

/**
 * ownwords CLI
 *
 * Own your words. Open source toolkit for authors who want to own their words.
 * Bi-directional WordPress sync, local Markdown editing, batch AI-assisted
 * editorial operations, and dual publishing to both WordPress and static sites.
 *
 * Commands:
 *   fetch <url> [output]         Fetch a WordPress article
 *   convert <input> [output]     Convert HTML to Markdown
 *   verify <html> <markdown>     Verify conversion quality
 *   batch <urls-file>            Batch convert multiple articles
 *   export <markdown> [output]   Export markdown to WordPress HTML
 *   config-wp <action>           Manage WordPress site configurations
 *   publish <markdown>           Publish markdown to WordPress
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { fetchArticle, extractSlugFromUrl } = require('../lib/fetch');
const { convertFile } = require('../lib/convert');
const { verifyConversion, verifyBatch } = require('../lib/verify');
const { exportToWordPress } = require('../lib/export');
const {
  getWordPressSite,
  addWordPressSite,
  removeWordPressSite,
  listWordPressSites,
  checkConfigPermissions,
  getConfigPath
} = require('../lib/config');
const { WpClient } = require('../lib/wp-api');
const { fetchViaApi, fetchViaApiMultiple } = require('../lib/fetch-api');
const {
  compareFiles,
  compareBatch,
  generateReport
} = require('../lib/compare');
const { updateFrontMatterWithWordPress } = require('../lib/image-utils');

const VERSION = require('../package.json').version;

// ============================================================================
// CLI HELPERS
// ============================================================================

function printVersion() {
  console.log(`ownwords v${VERSION}`);
}

function printHelp() {
  console.log(`
ownwords - Own Your Words

WordPress to Markdown conversion toolkit for human authors.

Usage: ownwords <command> [options]

Commands:
  fetch <url> [output]           Fetch a WordPress article as HTML
  convert <input> [output]       Convert HTML file to Markdown
  verify <html> <markdown>       Verify conversion quality
  batch <urls-file> [options]    Batch convert multiple articles
  export <markdown> [output]     Export markdown to WordPress HTML

  config-wp <action> [args]      Manage WordPress site configurations
    add <name> <url>             Add a new WordPress site
    remove <name>                Remove a WordPress site
    list                         List configured sites
    test [name]                  Test connection to a site

  publish <markdown> [options]   Publish markdown to WordPress
  publish-all <dir> [options]    Batch publish all markdown files

  compare <file1> <file2>        Compare two markdown files for content drift
  compare-batch <mapping.json>   Compare multiple file pairs from a JSON mapping

Options:
  --help, -h                     Show this help message
  --version, -v                  Show version number
  --silent                       Suppress output (for scripting)
  --verbose                      Show detailed output

Fetch Options:
  --output-dir=<dir>             Output directory (default: ./raw)
  --api                          Use WordPress REST API instead of HTML scraping
  --site=<name>                  WordPress site to use (for --api mode)
  --type=<type>                  Content type: posts (default) or pages

Convert Options:
  --slug=<slug>                  Override the slug
  --category=<category>          Set the category
  --series-order=<n>             Set the series order

Verify Options:
  --batch                        Batch verify all files in directories
  --strict                       Treat warnings as errors

Batch Options:
  --raw-dir=<dir>                Directory for HTML files (default: ./raw)
  --output-dir=<dir>             Directory for Markdown files (default: ./content/articles)
  --verify                       Verify after converting
  --skip-fetch                   Skip fetching, only convert existing HTML
  --api                          Use WordPress REST API instead of HTML scraping
  --site=<name>                  WordPress site to use (for --api mode)

Publish Options:
  --site=<name>                  WordPress site to publish to (default: default site)
  --status=<status>              Post status: draft, publish, future, private (default: draft)
  --update                       Update existing post if found by slug
  --date=<iso-date>              Publish date in ISO 8601 format (e.g., 2025-12-07T23:00:00)
  --dryrun                       Show what would be published without publishing

Export Options:
  --include-wrapper              Add WordPress block editor comments

Compare Options:
  --normalize                    Normalize typography before comparing (quotes, spaces)
  --verbose                      Show detailed context for differences
  --json                         Output comparison results as JSON

Examples:
  # Fetch a single article (HTML scraping)
  ownwords fetch https://example.com/blog/2025/01/01/my-article/

  # Fetch via REST API (richer metadata: categories, tags, author)
  ownwords fetch https://myblog.com/2025/01/my-article/ --api
  ownwords fetch my-article-slug --api --site=myblog

  # Convert HTML to Markdown
  ownwords convert ./raw/my-article.html ./content/articles/my-article.md

  # Verify a conversion
  ownwords verify ./raw/my-article.html ./content/articles/my-article.md

  # Batch convert from URLs file
  ownwords batch urls.txt --verify

  # Configure WordPress site
  ownwords config-wp add myblog https://myblog.com --username=author

  # Publish to WordPress
  ownwords publish ./content/articles/my-article.md --status=draft
  ownwords publish ./content/articles/my-article.md --status=publish --update
`);
}

function parseArgs(args) {
  const options = {
    command: null,
    positional: [],
    flags: {},
    verbose: false,
    silent: false
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.flags.version = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--silent') {
      options.silent = true;
    } else if (arg === '--verify') {
      options.flags.verify = true;
    } else if (arg === '--batch') {
      options.flags.batch = true;
    } else if (arg === '--strict') {
      options.flags.strict = true;
    } else if (arg === '--skip-fetch') {
      options.flags.skipFetch = true;
    } else if (arg === '--api') {
      options.flags.api = true;
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options.flags[key.replace(/-/g, '')] = value || true;
    } else if (!options.command) {
      options.command = arg;
    } else {
      options.positional.push(arg);
    }
  }

  return options;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function cmdFetch(options) {
  const urlOrSlug = options.positional[0];
  if (!urlOrSlug) {
    console.error('Error: URL or slug required');
    console.log('Usage: ownwords fetch <url> [output]');
    console.log('       ownwords fetch <url-or-slug> --api [--site=<name>]');
    process.exit(1);
  }

  // REST API mode
  if (options.flags.api) {
    const outputDir = options.flags.outputdir || './content/articles';

    try {
      const result = await fetchViaApi(urlOrSlug, outputDir, {
        site: options.flags.site,
        type: options.flags.type || 'posts',
        silent: options.silent
      });

      if (!options.silent) {
        console.log(`\n✅ Fetched via API: ${result.title}`);
        console.log(`   Slug: ${result.slug}`);
        console.log(`   Date: ${result.date}`);
        console.log(`   Words: ${result.wordCount}`);
        if (result.categories.length > 0) {
          console.log(`   Categories: ${result.categories.join(', ')}`);
        }
        if (result.tags.length > 0) {
          console.log(`   Tags: ${result.tags.join(', ')}`);
        }
        console.log(`   Markdown: ${result.mdPath}`);
        if (result.jsonPath) {
          console.log(`   JSON sidecar: ${result.jsonPath}`);
        }
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // HTML scraping mode (original behavior)
  const slug = extractSlugFromUrl(urlOrSlug);
  const outputDir = options.flags.outputdir || './raw';
  const output = options.positional[1] || path.join(outputDir, `${slug || 'article'}.html`);

  try {
    fetchArticle(urlOrSlug, output, { silent: options.silent });
    if (!options.silent) {
      console.log(`\nFetched successfully: ${output}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function cmdConvert(options) {
  const input = options.positional[0];
  if (!input) {
    console.error('Error: Input file required');
    console.log('Usage: ownwords convert <input> [output]');
    process.exit(1);
  }

  const slug = options.flags.slug || path.basename(input, '.html');
  const output = options.positional[1] || `./content/articles/${slug}.md`;

  try {
    const result = convertFile(input, output, {
      slug,
      category: options.flags.category,
      seriesOrder: options.flags.seriesorder ? parseInt(options.flags.seriesorder) : undefined,
      silent: options.silent
    });

    if (!options.silent) {
      console.log(`\nConverted: ${result.title}`);
      console.log(`  Words: ${result.wordCount}`);
      console.log(`  Output: ${output}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function cmdVerify(options) {
  // Batch mode
  if (options.flags.batch) {
    const htmlDir = options.positional[0] || './raw';
    const mdDir = options.positional[1] || './content/articles';

    const results = verifyBatch(htmlDir, mdDir, {
      strict: options.flags.strict
    });

    if (results.error) {
      console.error(`Error: ${results.error}`);
      process.exit(1);
    }

    // Print results
    console.log(`\nBatch Verification: ${htmlDir} -> ${mdDir}`);
    console.log('='.repeat(60));

    for (const file of results.files) {
      printVerifyResult(file, options.verbose);
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Files checked: ${results.summary.total}`);
    console.log(`  Passed: ${results.summary.passed}`);
    console.log(`  Warnings: ${results.summary.warnings}`);
    console.log(`  Failed: ${results.summary.failed}`);
    console.log(`  Total issues: ${results.summary.totalIssues}`);
    console.log(`  Total warnings: ${results.summary.totalWarnings}`);

    if (results.summary.failed > 0) {
      process.exit(1);
    } else if (results.summary.totalWarnings > 0) {
      process.exit(2);
    }
    return;
  }

  // Single file mode
  const htmlPath = options.positional[0];
  const mdPath = options.positional[1];

  if (!htmlPath || !mdPath) {
    console.error('Error: Both HTML and Markdown paths required');
    console.log('Usage: ownwords verify <html> <markdown>');
    console.log('       ownwords verify --batch <raw-dir> <markdown-dir>');
    process.exit(1);
  }

  const results = verifyConversion(htmlPath, mdPath, {
    strict: options.flags.strict
  });

  printVerifyResult(results, options.verbose);

  if (!results.passed) {
    process.exit(1);
  } else if (results.warnings.length > 0) {
    process.exit(2);
  }
}

function printVerifyResult(results, verbose) {
  const filename = path.basename(results.mdPath);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${filename}`);
  console.log('='.repeat(60));

  // Basic stats
  if (results.stats) {
    console.log(`\n  File sizes: HTML ${(results.stats.htmlSize / 1024).toFixed(1)} KB, MD ${(results.stats.mdSize / 1024).toFixed(1)} KB`);

    if (results.stats.wordComparison) {
      const wc = results.stats.wordComparison;
      const icon = wc.status === 'OK' ? '✅' : wc.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`  Word count: HTML ${wc.htmlWords}, MD ${wc.mdWords} (${wc.percentDiff}% diff) ${icon}`);
    }
  }

  // Detailed checks if verbose
  if (verbose && results.checks) {
    console.log('\n  Checks:');
    if (results.checks.headings) {
      console.log(`    Headings: HTML ${results.checks.headings.html}, MD ${results.checks.headings.md}`);
    }
    if (results.checks.urls) {
      console.log(`    URLs: HTML ${results.checks.urls.html}, MD ${results.checks.urls.md}`);
    }
    if (results.checks.images) {
      console.log(`    Images: HTML ${results.checks.images.html}, MD ${results.checks.images.md}`);
    }
    if (results.checks.code) {
      console.log(`    Code blocks: HTML ${results.checks.code.html}, MD ${results.checks.code.md}`);
    }
    if (results.checks.lists) {
      console.log(`    List items: HTML ${results.checks.lists.html}, MD ${results.checks.lists.md}`);
    }
  }

  // Issues
  if (results.issues.length > 0) {
    console.log('\n  ISSUES:');
    results.issues.forEach(issue => console.log(`    ❌ ${issue}`));
  }

  // Warnings
  if (results.warnings.length > 0) {
    console.log('\n  WARNINGS:');
    results.warnings.forEach(warning => console.log(`    ⚠️  ${warning}`));
  }

  // Summary
  if (results.issues.length === 0 && results.warnings.length === 0) {
    console.log('\n  ✅ All checks passed');
  } else if (results.issues.length === 0) {
    console.log(`\n  ⚠️  Passed with ${results.warnings.length} warning(s)`);
  } else {
    console.log(`\n  ❌ Failed: ${results.issues.length} issue(s), ${results.warnings.length} warning(s)`);
  }
}

async function cmdBatch(options) {
  const urlsFile = options.positional[0];

  if (!urlsFile) {
    console.error('Error: URLs file required');
    console.log('Usage: ownwords batch <urls-file> [options]');
    process.exit(1);
  }

  // Read URLs from file or parse from flag
  let urls = [];
  if (options.flags.urls) {
    urls = options.flags.urls.split(',').map(u => u.trim());
  } else if (fs.existsSync(urlsFile)) {
    const content = fs.readFileSync(urlsFile, 'utf-8');
    urls = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } else {
    console.error(`Error: URLs file not found: ${urlsFile}`);
    process.exit(1);
  }

  if (urls.length === 0) {
    console.error('Error: No URLs provided');
    process.exit(1);
  }

  const rawDir = options.flags.rawdir || './raw';
  const outputDir = options.flags.outputdir || './content/articles';
  const useApi = options.flags.api === true;

  console.log('='.repeat(60));
  console.log(`ownwords Batch ${useApi ? 'API Fetch' : 'Conversion'}`);
  console.log('='.repeat(60));
  console.log(`  URLs: ${urls.length}`);
  if (useApi) {
    console.log(`  Mode: REST API`);
    if (options.flags.site) {
      console.log(`  Site: ${options.flags.site}`);
    }
  } else {
    console.log(`  Raw directory: ${rawDir}`);
  }
  console.log(`  Output directory: ${outputDir}`);
  console.log('='.repeat(60));

  // REST API mode - fetch directly to markdown with enriched metadata
  if (useApi) {
    try {
      const batchResults = await fetchViaApiMultiple(urls, outputDir, {
        site: options.flags.site,
        type: options.flags.type || 'posts',
        silent: options.silent
      });

      // Summary
      console.log(`\n${'='.repeat(60)}`);
      console.log('SUMMARY');
      console.log('='.repeat(60));
      console.log(`  Total: ${batchResults.total}`);
      console.log(`  Successful: ${batchResults.success}`);
      console.log(`  Failed: ${batchResults.failed}`);

      if (batchResults.articles.length > 0) {
        console.log('\nFetched:');
        batchResults.articles.forEach(r => {
          const meta = [];
          if (r.categories.length > 0) meta.push(`${r.categories.length} categories`);
          if (r.tags.length > 0) meta.push(`${r.tags.length} tags`);
          const metaStr = meta.length > 0 ? ` [${meta.join(', ')}]` : '';
          console.log(`  ✅ ${r.slug} (${r.wordCount} words)${metaStr}`);
        });
      }

      if (batchResults.errors.length > 0) {
        console.log('\nFailed:');
        batchResults.errors.forEach(e => {
          console.log(`  ❌ ${e.input}: ${e.error}`);
        });
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // HTML scraping mode (original behavior)
  // Ensure directories exist
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = [];

  for (const url of urls) {
    const slug = extractSlugFromUrl(url);
    if (!slug) {
      console.error(`\nCould not extract slug from URL: ${url}`);
      results.push({ url, success: false, error: 'Invalid URL' });
      continue;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Processing: ${slug}`);
    console.log('─'.repeat(60));

    const htmlPath = path.join(rawDir, `${slug}.html`);
    const mdPath = path.join(outputDir, `${slug}.md`);

    try {
      // Fetch if not skipping
      if (!options.flags.skipFetch) {
        fetchArticle(url, htmlPath, { silent: options.silent });
      } else if (!fs.existsSync(htmlPath)) {
        console.error(`  HTML file not found and --skip-fetch is set: ${htmlPath}`);
        results.push({ url, slug, success: false, error: 'HTML not found' });
        continue;
      }

      // Convert
      const convertResult = convertFile(htmlPath, mdPath, { slug, silent: options.silent });

      // Verify if requested
      let verification = null;
      if (options.flags.verify) {
        verification = verifyConversion(htmlPath, mdPath);
        if (verification.issues.length > 0) {
          console.log('  ❌ Verification failed:');
          verification.issues.forEach(issue => console.log(`     - ${issue}`));
        } else if (verification.warnings.length > 0) {
          console.log(`  ⚠️  ${verification.warnings.length} warning(s)`);
        } else {
          console.log('  ✅ Verified');
        }
      }

      results.push({
        url,
        slug,
        success: true,
        ...convertResult,
        verification
      });

    } catch (error) {
      console.error(`  Error: ${error.message}`);
      results.push({ url, slug, success: false, error: error.message });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  Total: ${results.length}`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\nConverted:');
    successful.forEach(r => {
      console.log(`  ✅ ${r.slug} (${r.wordCount} words)`);
    });
  }

  if (failed.length > 0) {
    console.log('\nFailed:');
    failed.forEach(r => {
      console.log(`  ❌ ${r.slug || r.url}: ${r.error}`);
    });
    process.exit(1);
  }
}

function cmdExport(options) {
  const mdPath = options.positional[0];

  if (!mdPath) {
    console.error('Error: Markdown file required');
    console.log('Usage: ownwords export <markdown> [output]');
    process.exit(1);
  }

  if (!fs.existsSync(mdPath)) {
    console.error(`Error: File not found: ${mdPath}`);
    process.exit(1);
  }

  const slug = path.basename(mdPath, '.md');
  const output = options.positional[1] || `./wordpress-export/${slug}.html`;

  try {
    const result = exportToWordPress(mdPath, output, {
      includeWrapper: options.flags.includewrapper || false
    });

    if (!options.silent) {
      console.log(`\nExported: ${result.title}`);
      console.log(`  Words: ${result.wordCount}`);
      console.log(`  Output: ${output}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Prompt for input (used for password entry)
 */
function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (hidden && process.stdin.isTTY) {
      // For hidden input, we need to handle it differently
      process.stdout.write(question);
      let input = '';

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(1);
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += char;
        }
      };

      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function cmdConfigWp(options) {
  const action = options.positional[0];

  if (!action) {
    console.error('Error: Action required');
    console.log('Usage: ownwords config-wp <add|remove|list|test> [args]');
    process.exit(1);
  }

  switch (action) {
    case 'add': {
      const name = options.positional[1];
      const url = options.positional[2];

      if (!name || !url) {
        console.error('Error: Name and URL required');
        console.log('Usage: ownwords config-wp add <name> <url> --username=<user>');
        process.exit(1);
      }

      let username = options.flags.username;
      let appPassword = options.flags.password;

      // Prompt for missing credentials
      if (!username) {
        username = await prompt('WordPress username: ');
      }

      if (!appPassword) {
        appPassword = await prompt('Application password: ', true);
      }

      if (!username || !appPassword) {
        console.error('Error: Username and password required');
        process.exit(1);
      }

      const setAsDefault = options.flags.default === true ||
        listWordPressSites().length === 0;

      addWordPressSite(name, { url, username, appPassword }, setAsDefault);

      console.log(`\n✅ Added WordPress site: ${name}`);
      console.log(`   URL: ${url}`);
      console.log(`   Username: ${username}`);
      if (setAsDefault) {
        console.log(`   Set as default site`);
      }

      // Check permissions
      const perms = checkConfigPermissions();
      if (!perms.secure) {
        console.log(`\n⚠️  Warning: ${perms.message}`);
      }
      break;
    }

    case 'remove': {
      const name = options.positional[1];

      if (!name) {
        console.error('Error: Site name required');
        console.log('Usage: ownwords config-wp remove <name>');
        process.exit(1);
      }

      if (removeWordPressSite(name)) {
        console.log(`✅ Removed WordPress site: ${name}`);
      } else {
        console.error(`Error: Site not found: ${name}`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const sites = listWordPressSites();

      if (sites.length === 0) {
        console.log('No WordPress sites configured.');
        console.log('\nAdd one with: ownwords config-wp add <name> <url>');
      } else {
        console.log('Configured WordPress sites:\n');
        for (const site of sites) {
          const defaultTag = site.isDefault ? ' (default)' : '';
          console.log(`  ${site.name}${defaultTag}`);
          console.log(`    URL: ${site.url}`);
          console.log(`    Username: ${site.username}`);
          console.log('');
        }
      }

      console.log(`Config file: ${getConfigPath()}`);
      break;
    }

    case 'test': {
      const name = options.positional[1];
      const site = getWordPressSite(name);

      if (!site) {
        if (name) {
          console.error(`Error: Site not found: ${name}`);
        } else {
          console.error('Error: No WordPress sites configured');
          console.log('Add one with: ownwords config-wp add <name> <url>');
        }
        process.exit(1);
      }

      console.log(`Testing connection to: ${site.url}`);

      try {
        const client = new WpClient(site);
        const result = await client.testConnection();

        if (result.success) {
          console.log(`\n✅ Connection successful!`);
          console.log(`   User: ${result.user.name} (@${result.user.slug})`);
        } else {
          console.log(`\n❌ Connection failed: ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
      console.log('Usage: ownwords config-wp <add|remove|list|test> [args]');
      process.exit(1);
  }
}

async function cmdPublish(options) {
  const mdPath = options.positional[0];

  if (!mdPath) {
    console.error('Error: Markdown file required');
    console.log('Usage: ownwords publish <markdown> [options]');
    process.exit(1);
  }

  if (!fs.existsSync(mdPath)) {
    console.error(`Error: File not found: ${mdPath}`);
    process.exit(1);
  }

  // Get WordPress site
  const siteName = options.flags.site;
  const site = getWordPressSite(siteName);

  if (!site) {
    if (siteName) {
      console.error(`Error: Site not found: ${siteName}`);
    } else {
      console.error('Error: No WordPress site configured');
      console.log('Add one with: ownwords config-wp add <name> <url>');
    }
    process.exit(1);
  }

  const status = options.flags.status || 'draft';
  const update = options.flags.update === true;
  const dryRun = options.flags.dryrun === true;
  const publishDate = options.flags.date; // ISO 8601 format, e.g., "2025-12-07T23:00:00"

  if (!options.silent) {
    console.log(`Publishing to: ${site.url}`);
    console.log(`  File: ${mdPath}`);
    console.log(`  Status: ${status}`);
    console.log(`  Update existing: ${update}`);
    if (publishDate) {
      console.log(`  Publish date: ${publishDate}`);
    }
    if (dryRun) {
      console.log('  DRY RUN - no changes will be made');
    }
  }

  if (dryRun) {
    // Just export and show what would be published
    try {
      const result = exportToWordPress(mdPath, null, { outputToFile: false });
      console.log(`\nWould publish:`);
      console.log(`  Title: ${result.title}`);
      console.log(`  Slug: ${result.slug}`);
      console.log(`  Words: ${result.wordCount}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  try {
    const client = new WpClient(site);
    const result = await client.publishMarkdown(mdPath, {
      status,
      update,
      date: publishDate,
      siteName: siteName || site.url,
      silent: options.silent
    });

    console.log(`\n✅ ${result.action === 'created' ? 'Published' : 'Updated'}!`);
    console.log(`   Post ID: ${result.postId}`);
    console.log(`   Slug: ${result.slug}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   URL: ${result.link}`);
    if (result.imagesUploaded > 0) {
      console.log(`   Images uploaded: ${result.imagesUploaded}`);
    }

    // Save WordPress metadata back to the markdown file
    try {
      updateFrontMatterWithWordPress(mdPath, result);
      if (!options.silent) {
        console.log(`   Metadata saved to: ${path.basename(mdPath)}`);
      }
    } catch (metaError) {
      console.error(`   Warning: Failed to save metadata: ${metaError.message}`);
    }
  } catch (error) {
    console.error(`\n❌ Publish failed: ${error.message}`);
    process.exit(1);
  }
}

async function cmdPublishAll(options) {
  const dir = options.positional[0];

  if (!dir) {
    console.error('Error: Directory required');
    console.log('Usage: ownwords publish-all <directory> [options]');
    process.exit(1);
  }

  if (!fs.existsSync(dir)) {
    console.error(`Error: Directory not found: ${dir}`);
    process.exit(1);
  }

  // Get all markdown files
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log('No markdown files found in directory.');
    return;
  }

  // Get WordPress site
  const siteName = options.flags.site;
  const site = getWordPressSite(siteName);

  if (!site) {
    if (siteName) {
      console.error(`Error: Site not found: ${siteName}`);
    } else {
      console.error('Error: No WordPress site configured');
      console.log('Add one with: ownwords config-wp add <name> <url>');
    }
    process.exit(1);
  }

  const status = options.flags.status || 'draft';
  const update = options.flags.update === true;
  const dryRun = options.flags.dryrun === true;

  console.log(`Publishing ${files.length} files to: ${site.url}`);
  console.log(`  Status: ${status}`);
  console.log(`  Update existing: ${update}`);
  if (dryRun) {
    console.log('  DRY RUN - no changes will be made');
  }
  console.log('');

  const client = new WpClient(site);
  const results = { success: [], failed: [] };

  for (const file of files) {
    const mdPath = path.join(dir, file);
    const slug = path.basename(file, '.md');

    process.stdout.write(`  ${slug}... `);

    if (dryRun) {
      console.log('(dry run)');
      results.success.push({ slug, action: 'dry-run' });
      continue;
    }

    try {
      const result = await client.publishMarkdown(mdPath, { status, update });
      console.log(`✅ ${result.action}`);
      results.success.push({ slug, ...result });
    } catch (error) {
      console.log(`❌ ${error.message}`);
      results.failed.push({ slug, error: error.message });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Success: ${results.success.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    process.exit(1);
  }
}

// ============================================================================
// COMPARE COMMANDS
// ============================================================================

function cmdCompare(options) {
  const file1 = options.positional[0];
  const file2 = options.positional[1];

  if (!file1 || !file2) {
    console.error('Error: Two files required');
    console.log('Usage: ownwords compare <file1> <file2> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --normalize    Normalize typography before comparing');
    console.log('  --verbose      Show detailed context for differences');
    console.log('  --json         Output as JSON');
    process.exit(1);
  }

  if (!fs.existsSync(file1)) {
    console.error(`Error: File not found: ${file1}`);
    process.exit(1);
  }

  if (!fs.existsSync(file2)) {
    console.error(`Error: File not found: ${file2}`);
    process.exit(1);
  }

  const normalizeTypography = options.flags.normalize === true;
  const verbose = options.flags.verbose === true;
  const jsonOutput = options.flags.json === true;

  try {
    const result = compareFiles(file1, file2, { normalizeTypography });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Human-readable output
    console.log('='.repeat(60));
    console.log('Content Comparison');
    console.log('='.repeat(60));
    console.log(`  File 1: ${file1}`);
    console.log(`  File 2: ${file2}`);
    console.log('');

    console.log(generateReport(result, { verbose }));

    // Exit code based on result
    if (!result.identicalAfterNormalization) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function cmdCompareBatch(options) {
  const mappingFile = options.positional[0];

  if (!mappingFile) {
    console.error('Error: Mapping file required');
    console.log('Usage: ownwords compare-batch <mapping.json> [options]');
    console.log('');
    console.log('The mapping file should be a JSON array of objects with:');
    console.log('  { "file1": "path/to/local.md", "file2": "path/to/remote.md", "name": "optional label" }');
    process.exit(1);
  }

  if (!fs.existsSync(mappingFile)) {
    console.error(`Error: Mapping file not found: ${mappingFile}`);
    process.exit(1);
  }

  const normalizeTypography = options.flags.normalize === true;
  const jsonOutput = options.flags.json === true;

  try {
    const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

    if (!Array.isArray(mapping)) {
      console.error('Error: Mapping file must contain a JSON array');
      process.exit(1);
    }

    const result = compareBatch(mapping, { normalizeTypography });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Human-readable output
    console.log('='.repeat(60));
    console.log('Batch Content Comparison');
    console.log('='.repeat(60));
    console.log(`  Total files: ${result.total}`);
    console.log(`  Identical: ${result.identical}`);
    console.log(`  Identical (after normalization): ${result.identicalAfterNormalization}`);
    console.log(`  Different: ${result.different}`);
    console.log('');

    for (const r of result.results) {
      const status = r.error ? '❌ ERROR' :
                     r.identical ? '✅ IDENTICAL' :
                     r.identicalAfterNormalization ? '🔤 TYPOGRAPHY ONLY' :
                     '⚠️  DIFFERENT';

      console.log(`${status}: ${r.name}`);

      if (r.error) {
        console.log(`   Error: ${r.error}`);
      } else if (!r.identicalAfterNormalization) {
        console.log(`   Words: ${r.stats.content1.wordCount} vs ${r.stats.content2.wordCount}`);
        if (r.typography.differences.length > 0) {
          console.log(`   Typography diffs: ${r.typography.differences.length}`);
        }
      }
    }

    // Exit code based on result
    if (result.different > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.flags.version) {
    printVersion();
    process.exit(0);
  }

  if (options.flags.help || !options.command) {
    printHelp();
    process.exit(0);
  }

  switch (options.command) {
    case 'fetch':
      await cmdFetch(options);
      break;
    case 'convert':
      cmdConvert(options);
      break;
    case 'verify':
      cmdVerify(options);
      break;
    case 'batch':
      await cmdBatch(options);
      break;
    case 'export':
      cmdExport(options);
      break;
    case 'config-wp':
      await cmdConfigWp(options);
      break;
    case 'publish':
      await cmdPublish(options);
      break;
    case 'publish-all':
      await cmdPublishAll(options);
      break;
    case 'compare':
      cmdCompare(options);
      break;
    case 'compare-batch':
      cmdCompareBatch(options);
      break;
    default:
      console.error(`Unknown command: ${options.command}`);
      console.log('Run "ownwords --help" for usage information.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
