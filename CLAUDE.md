# Claude Code Context: ownwords

## Repository: ownwords (PUBLIC, open source)

Own your words. Open source toolkit for authors who want to own their words. Bi-directional WordPress sync, local Markdown editing, batch AI-assisted editorial operations, and dual publishing to both WordPress and static sites. Your content, your files, your control.

## Purpose

This is a **standalone npm package** published on npm. It can be used with any WordPress site by anyone.

## CRITICAL: Fetching Articles to Target Sites

**When asked to fetch an article, you MUST:**

1. **ASK the user which local directory** the article should go to — never assume
2. **Check the target site's existing structure** before fetching:
   ```bash
   find /path/to/target-site/content -name "*.md" | head -5
   ```
3. **Read the target site's CLAUDE.md** if it exists — it will document that site's content structure
4. **Use the appropriate flags** based on what you learned (e.g., `--hierarchical` if the site uses hierarchical structure)

### Why ASK First?

- Users may have multiple local repos for different purposes
- The source URL does NOT determine the target folder — the user's intent does
- Articles can be published to multiple sites (many-to-many publishing)
- Only the user knows their content organization

### Common Mistakes to AVOID

1. **Never assume the target directory** — always ask or confirm with the user
2. **Never use `~` in shell arguments** — shells don't expand `~` in all contexts; use `$HOME` or full paths
3. **Never hardcode paths** — paths vary by user, machine, and operating system
4. **Always check target structure first** — different sites use different conventions

## Publishing to WordPress

The `ownwords publish` command defaults to `publish` status (not draft). This means:
- New posts are published immediately
- Updated posts remain published

Use `--status=draft` only if you explicitly want an unpublished draft.

**Before publishing, ALWAYS:**
1. Run with `--dryrun` first to verify it shows "UPDATE existing post" (for updates)
2. Verify the post_id in front matter matches the WordPress post (for updates)

## CLI Commands

```bash
ownwords fetch <url>              # Fetch WordPress article
ownwords convert <html> [md]      # Convert to Markdown
ownwords verify <html> <md>       # Verify conversion
ownwords batch <urls-file>        # Batch convert
ownwords export <md>              # Export to WordPress HTML
```

Run `ownwords --help` for full options including `--hierarchical`, `--output-dir`, `--api`, etc.

## Image Downloading (fetch --api)

By default, `fetch --api` downloads all images locally and rewrites URLs to local paths. This makes local files self-sufficient for testing and ensures you own your content.

**Features:**
- **Smart caching**: Only downloads if file doesn't exist or has changed (compares Content-Length)
- **Size deduplication**: WordPress/Jetpack CDN serves multiple sizes via query params (`?resize=1024x1024`). Ownwords picks the highest quality version.
- **URL rewriting**: All image URLs in markdown body AND `featured_image` in front matter are rewritten to local relative paths (`./image.png`)
- **Sidecar tracking**: Creates `index.images.json` to track original URLs → local filenames (used by publish to avoid re-uploading)

**Flags:**
- `--no-images` — Skip image downloading, keep remote WordPress URLs

**Example output:**
```
📷 Found 20 images to download...
  ✓ Unchanged: image1.png (412.1 KB)
  ✓ Unchanged: image2.png (855.9 KB)
📷 Images: 2 unchanged
```

The 20 URLs were deduplicated to 2 unique images (different size variants of same image).

### Image Sidecar Format Contract

The `index.images.json` sidecar file is used by BOTH fetch and publish. It MUST use this exact format:

```json
{
  "site": "https://example.com",
  "lastUpdated": "ISO-8601 timestamp",
  "uploaded": {
    "./local-filename.png": {
      "url": "https://example.com/wp-content/uploads/.../filename.png",
      "hash": "md5-hash-of-local-file",
      "uploadedAt": "ISO-8601 timestamp"
    }
  }
}
```

**Required fields:**
- `site` - WordPress site URL, used to verify the sidecar matches the target site
- `uploaded` - Object keyed by LOCAL path (e.g., `./image.png`)
- `url` - The WordPress URL to reuse (prevents re-upload)
- `hash` - MD5 hash of local file for change detection

**Contract rules:**
1. Fetch MUST write this format (not a different "download" format)
2. Publish MUST read this format to check for existing uploads
3. Both commands MUST use the same key format (`./filename.png`)

## Front Matter Format Contract

The `fetch --api` command produces YAML front matter with specific formats that downstream build tools must handle:

```yaml
title: "Article Title"
slug: "article-slug"
date: "2025-02-27T22:36:03"        # ISO datetime WITH time (not just YYYY-MM-DD)
modified: "2025-04-05T12:16:43"    # Only if different from date
description: "SEO description..."
canonical_url: "https://example.com/blog/..."
categories:
  - "Category Name"
tags:
  - "tag1"
  - "tag2"
author: "Author Name"
featured_image: "./local-image.jpg"  # Local path after image download
featured_image_alt: "Alt text"
wordpress:
  post_id: 1234
  category_ids: [6]
  tag_ids: [123, 456]
  author_id: 789
  synced_at: "2025-12-16T23:42:10.108Z"
```

**Important for build tools:**
- `date` includes time component — parse with `split('T')[0]` if only date needed
- `featured_image` is a local path (`./filename.jpg`) — strip `./` for HTML src attributes
- `categories` and `tags` are arrays of strings, not IDs

**Post-fetch improvements often needed:**

The fetched `description` is usually the WordPress excerpt — often truncated or generic. Before publishing, improve it for SEO:
- Keep to 150-160 characters
- Front-load searchable names and keywords
- Be specific about the content
- See `article-publishing.md` runbook for detailed guidelines

The fetched `tags` may also need optimization:
- Add names of people mentioned in the article
- Add both short and long forms (AI + artificial intelligence)
- Remove generic tags (technology, leadership)
- See `article-publishing.md` runbook for detailed guidelines

## Image Dimension Handling

When publishing markdown to WordPress, ownwords automatically adds `width` and `height` attributes to local images. This:

- Prevents layout shift during page load
- Enables WordPress/Jetpack to generate proper responsive `srcset`
- Ensures consistent sizing across browsers

**Format detection:** Uses magic bytes (not file extension) to detect format, so mislabeled files (e.g., PNG saved as `.webp`) are handled correctly.

**Supported formats:** JPEG, PNG, WebP, GIF (with macOS `sips` fallback for others).

## YouTube Embed Handling

WordPress YouTube embeds (iframe-based) are converted to clickable thumbnail images:

**WordPress HTML input:**
```html
<figure class="wp-block-embed-youtube">
  <iframe src="https://www.youtube.com/embed/VIDEO_ID" title="Video Title"></iframe>
</figure>
```

**Markdown output:**
```markdown
[![Video Title](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://www.youtube.com/watch?v=VIDEO_ID)
```

**Why thumbnails instead of iframes?**
- Markdown doesn't support iframes
- Thumbnails are portable across all markdown renderers
- Clicking opens YouTube directly
- Build tools can optionally convert back to iframes for HTML output

**The YouTube thumbnail is also downloaded locally** (as `maxresdefault.jpg`) to keep articles self-contained.

## Library Usage

```javascript
const { fetchArticle, convertFile, verifyConversion, AgentAPI } = require('ownwords');

// Fetch and convert
const html = await fetchArticle('https://example.com/blog/article/');
const result = await convertFile('./raw/article.html', './content/article.md');

// Agent API for batch operations
const agent = new AgentAPI('./content/articles/');
await agent.findAndReplace({ pattern: /old/g, replacement: 'new' });
```

## Development

```bash
npm install           # Install dependencies
npm link              # Link for local CLI testing
npm test              # Run tests

ownwords --version    # Verify CLI works
ownwords --help       # See all commands and options
```

## Project Structure

```
ownwords/
├── bin/
│   └── ownwords.js       # CLI entry point
├── lib/
│   ├── index.js          # Main exports
│   ├── fetch.js          # WordPress fetching
│   ├── convert.js        # HTML to Markdown
│   ├── verify.js         # QA verification
│   ├── export.js         # Export to WordPress HTML
│   └── agent-api.js      # Agent-friendly batch operations
├── package.json
├── README.md
├── LICENSE               # MIT
└── CLAUDE.md             # This file
```

## Known Limitations

### YouTube embeds become thumbnails (not re-embedded on publish)

When fetching, YouTube iframes are converted to clickable thumbnail images (see "YouTube Embed Handling" above). When publishing back to WordPress, these remain as images linking to YouTube — they do **not** automatically convert back to embedded players.

**Workaround:** After publishing, manually edit the post in WordPress to replace the image with a YouTube embed block.

**Future enhancement:** Add option to `publish` command to detect YouTube thumbnail links and convert them back to WordPress YouTube embed blocks.

### WordPress galleries lose grid layout

WordPress gallery blocks have CSS classes that create multi-column layouts. During HTML→Markdown conversion, these classes are stripped. The result is images displayed as a vertical stack rather than a grid.

**Workaround:**
- Edit the markdown to use custom gallery markers
- Add gallery CSS to the build template
- Manually recreate the gallery in WordPress after publishing

**Future enhancement:** Preserve gallery structure with custom markdown syntax that build tools can recognize.

### Image captions may be separated from images

WordPress figure/figcaption relationships can be lost during conversion, resulting in captions appearing as separate italic text rather than associated with their images.

**Workaround:** Use markdown image title syntax to keep captions with images:
```markdown
[![Alt text](./image.jpg "Caption text")](./image.jpg)
```

## Git Operations

This is a standalone repository. If you're using ownwords alongside other site repositories, ensure you're in the correct directory before any git commands.

## Contributing

This is open source software (MIT license). Contributions are welcome.
