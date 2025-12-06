#!/usr/bin/env node

/**
 * ownwords CLI
 *
 * Own your words. WordPress to Markdown conversion toolkit for human authors.
 *
 * Commands:
 *   fetch <url> [output]         Fetch a WordPress article
 *   convert <input> [output]     Convert HTML to Markdown
 *   verify <html> <markdown>     Verify conversion quality
 *   batch <urls-file>            Batch convert multiple articles
 *   export <markdown> [output]   Export markdown to WordPress HTML
 */

const fs = require('fs');
const path = require('path');
const { fetchArticle, fetchMultiple, extractSlugFromUrl } = require('../lib/fetch');
const { convertFile } = require('../lib/convert');
const { verifyConversion, verifyBatch } = require('../lib/verify');

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

Options:
  --help, -h                     Show this help message
  --version, -v                  Show version number
  --silent                       Suppress output (for scripting)
  --verbose                      Show detailed output

Fetch Options:
  --output-dir=<dir>             Output directory (default: ./raw)

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

Examples:
  # Fetch a single article
  ownwords fetch https://example.com/blog/2025/01/01/my-article/

  # Convert HTML to Markdown
  ownwords convert ./raw/my-article.html ./content/articles/my-article.md

  # Verify a conversion
  ownwords verify ./raw/my-article.html ./content/articles/my-article.md

  # Batch convert from URLs file
  ownwords batch urls.txt --verify

  # Batch verify all conversions
  ownwords verify --batch ./raw ./content/articles
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

function cmdFetch(options) {
  const url = options.positional[0];
  if (!url) {
    console.error('Error: URL required');
    console.log('Usage: ownwords fetch <url> [output]');
    process.exit(1);
  }

  const slug = extractSlugFromUrl(url);
  const outputDir = options.flags.outputdir || './raw';
  const output = options.positional[1] || path.join(outputDir, `${slug || 'article'}.html`);

  try {
    fetchArticle(url, output, { silent: options.silent });
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

function cmdBatch(options) {
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

  console.log('='.repeat(60));
  console.log('Draftsmith Batch Conversion');
  console.log('='.repeat(60));
  console.log(`  URLs: ${urls.length}`);
  console.log(`  Raw directory: ${rawDir}`);
  console.log(`  Output directory: ${outputDir}`);
  console.log('='.repeat(60));

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

  // For now, just a placeholder - export functionality to be implemented
  console.log('Export functionality coming soon.');
  console.log('For now, the markdown files can be converted manually or use the build system.');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
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
      cmdFetch(options);
      break;
    case 'convert':
      cmdConvert(options);
      break;
    case 'verify':
      cmdVerify(options);
      break;
    case 'batch':
      cmdBatch(options);
      break;
    case 'export':
      cmdExport(options);
      break;
    default:
      console.error(`Unknown command: ${options.command}`);
      console.log('Run "ownwords --help" for usage information.');
      process.exit(1);
  }
}

main();
