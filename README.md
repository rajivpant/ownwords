# ownwords

**Own your words.** A WordPress to Markdown conversion toolkit for human authors with AI-assisted editing.

## Vision

This toolkit is for human authors who want to:

1. **Own their content as local markdown files** - not locked in WordPress
2. **Use AI assistants for editorial tasks** - batch updates, terminology changes, link fixes
3. **Maintain dual publishing** - to WordPress and static sites simultaneously

**This is explicitly NOT for**: AI content generation, "slop" production, or replacing human authorship.

## Features

- **Fetch**: Download WordPress articles as raw HTML
- **Convert**: Transform HTML to clean Markdown with YAML front matter
- **Verify**: Independent QA verification of conversion accuracy
- **Export**: Convert Markdown back to WordPress-ready HTML
- **Publish**: Push content directly to WordPress via REST API
- **Agent API**: Batch operations for AI-assisted editorial tasks

## Installation

```bash
npm install ownwords
```

Or use directly via npx:

```bash
npx ownwords --help
```

## CLI Usage

### Fetch a WordPress Article

```bash
# Fetch and save to ./raw/
ownwords fetch https://example.com/blog/2025/01/01/my-article/

# Specify output path
ownwords fetch https://example.com/blog/2025/01/01/my-article/ ./raw/my-article.html
```

### Convert HTML to Markdown

```bash
# Basic conversion
ownwords convert ./raw/my-article.html

# With metadata options
ownwords convert ./raw/my-article.html ./content/articles/my-article.md \
  --category="Core Series" \
  --series-order=1
```

### Verify Conversion Quality

```bash
# Verify single file
ownwords verify ./raw/my-article.html ./content/articles/my-article.md

# Batch verify all conversions
ownwords verify --batch ./raw ./content/articles

# Verbose output
ownwords verify --verbose ./raw/my-article.html ./content/articles/my-article.md
```

### Batch Convert Multiple Articles

```bash
# From URLs file
ownwords batch urls.txt --verify

# Skip fetch (convert existing HTML only)
ownwords batch urls.txt --skip-fetch --verify
```

**URLs file format:**
```
# Comments start with #
https://example.com/blog/2025/01/01/first-article/
https://example.com/blog/2025/01/02/second-article/
```

## Library Usage

```javascript
const {
  fetchArticle,
  convertFile,
  verifyConversion,
  exportToWordPress,
  AgentAPI
} = require('ownwords');

// Fetch an article
const html = fetchArticle(
  'https://example.com/blog/2025/01/01/my-article/',
  './raw/my-article.html'
);

// Convert to Markdown
const result = convertFile('./raw/my-article.html', './content/my-article.md', {
  category: 'Core Series',
  slug: 'my-article'
});
console.log(`Converted: ${result.title} (${result.wordCount} words)`);

// Verify conversion
const verification = verifyConversion('./raw/my-article.html', './content/my-article.md');
if (verification.issues.length > 0) {
  console.error('Issues found:', verification.issues);
}

// Export back to WordPress HTML
const exported = exportToWordPress('./content/my-article.md', './export/my-article.html');
```

## Agent API for AI-Assisted Editing

The Agent API is designed for AI coding assistants (Claude, Cursor, etc.) to perform batch editorial tasks:

```javascript
const { AgentAPI } = require('ownwords');
const agent = new AgentAPI('./content/articles/', {
  rawDir: './raw'  // For verification
});

// List all articles
const articles = agent.listArticles();
console.log(`Found ${articles.length} articles`);

// Search for content
const matches = agent.search('synthesis coding');

// Batch find and replace
const changes = agent.findAndReplace({
  pattern: /Claude AI/g,
  replacement: 'Claude',
  dryRun: true  // Preview changes first
});
console.log(`Would update ${changes.length} files`);

// Actually apply changes
agent.findAndReplace({
  pattern: /Claude AI/g,
  replacement: 'Claude'
});

// Update links (domain migration)
agent.updateLinks({
  oldDomain: 'old-site.com',
  newDomain: 'new-site.com'
});

// Update front matter
agent.updateFrontMatter({
  updates: { author: 'Rajiv Pant' },
  filter: (article) => !article.author  // Only articles without author
});

// Validate all articles
const results = agent.validateAll();
console.log(`${results.passed} of ${results.total} passed`);
```

## Front Matter Schema

Generated Markdown includes YAML front matter:

```yaml
---
title: "Article Title"
slug: "article-slug"
date: "2025-01-01"
canonical_url: "https://example.com/blog/2025/01/01/article-slug/"
description: "Meta description from WordPress"
category: "Category Name"
series_order: 1
wordpress_synced: "2025-01-01"
---
```

## Verification Checks

The verify command performs comprehensive QA:

- **Front matter validation** - Required fields present, valid formats
- **Markdown structure** - No unclosed links, code blocks, or HTML remnants
- **Word count comparison** - Detects significant content loss (>15% triggers error)
- **Heading preservation** - All section headings converted
- **URL/link preservation** - All article links present
- **Image preservation** - Images not lost in conversion
- **Code block preservation** - Code blocks converted correctly
- **List item preservation** - List items not lost
- **Sentence spot-checking** - Samples sentences for accuracy

**Exit codes:**
- `0` - All checks passed
- `1` - Issues found (errors)
- `2` - Warnings only

## WordPress Publishing

ownwords can publish directly to WordPress using the REST API with Application Passwords.

### Configure WordPress Connection

```bash
# Add a WordPress site
ownwords config-wp add myblog https://myblog.example.com --username=author
# You'll be prompted for the Application Password

# List configured sites
ownwords config-wp list

# Test connection
ownwords config-wp test myblog
```

**Note:** You need to create an Application Password in WordPress (Users → Your Profile → Application Passwords).

### Publish to WordPress

```bash
# Publish as draft (default)
ownwords publish ./content/articles/my-article.md

# Publish immediately
ownwords publish ./content/articles/my-article.md --status=publish

# Update existing post (finds by slug)
ownwords publish ./content/articles/my-article.md --update

# Publish to specific site
ownwords publish ./content/articles/my-article.md --site=myblog

# Dry run (preview without publishing)
ownwords publish ./content/articles/my-article.md --dry-run
```

### Batch Publish

```bash
# Publish all markdown files in a directory
ownwords publish-all ./content/articles/ --status=draft

# Update all existing posts
ownwords publish-all ./content/articles/ --update --status=publish
```

### Environment Variables

For CI/CD environments, use environment variables instead of the config file:

```bash
export OWNWORDS_WP_SITE=https://myblog.example.com
export OWNWORDS_WP_USERNAME=author
export OWNWORDS_WP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

### WordPress API in Code

```javascript
const { WpClient } = require('ownwords');

const client = new WpClient({
  url: 'https://myblog.example.com',
  username: 'author',
  appPassword: 'xxxx xxxx xxxx xxxx'
});

// Test connection
const result = await client.testConnection();
console.log(result.success ? 'Connected!' : result.error);

// Publish markdown file
const post = await client.publishMarkdown('./content/my-article.md', {
  status: 'publish',
  update: true  // Update if exists
});
console.log(`Published: ${post.link}`);

// Create post directly
const newPost = await client.createPost({
  title: 'My Article',
  content: '<p>Hello world</p>',
  status: 'draft'
});
```

## Dual Publishing Workflow

### Automated Workflow (Recommended)

1. **Edit locally**: Modify markdown files with your preferred editor or AI assistant
2. **Deploy static site**: Push changes to GitHub → Cloudflare Pages auto-deploys
3. **Publish to WordPress**: `ownwords publish ./content/articles/my-article.md --update`

### Manual Workflow

1. **Edit locally**: Modify markdown files
2. **Build**: Generate HTML for your static site
3. **Export**: Generate WordPress-ready HTML with `ownwords export`
4. **Copy to WordPress**: Paste exported HTML into WordPress editor
5. **Deploy static site**: Push changes to your static site host

## Dependencies

This toolkit uses only Node.js built-in modules:
- `fs`
- `path`
- `child_process` (for curl)

No npm packages required for core functionality.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please open an issue to discuss before submitting PRs.

## Author

Rajiv Pant

---

*This project was created to support the [Synthesis Coding](https://synthesiscoding.com) methodology.*
