# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-05

### Added

- **Core Features**
  - WordPress article fetching via `ownwords fetch`
  - HTML to Markdown conversion with YAML front matter via `ownwords convert`
  - Conversion verification and QA via `ownwords verify`
  - Markdown to WordPress HTML export via `ownwords export`
  - Batch processing via `ownwords batch`

- **WordPress Publishing**
  - WordPress REST API integration via `ownwords publish`
  - Multi-site configuration via `ownwords config-wp`
  - Batch publishing via `ownwords publish-all`
  - Support for Application Passwords authentication

- **Agent API**
  - `AgentAPI` class for AI-assisted batch operations
  - Search, find-and-replace, and link migration utilities
  - Front matter updates and validation

- **Library API**
  - All CLI functionality available as importable functions
  - `WpClient` for programmatic WordPress publishing
  - Configuration management utilities

### Security

- Credentials stored in `~/.ownwords/config.json` with `600` permissions
- Environment variable support for CI/CD
- HTTPS-only WordPress API communication

---

## [1.1.0] - 2025-12-05

### Changed

- **HTML to Markdown conversion now uses Turndown library** - Replaced custom regex-based conversion with the battle-tested [Turndown](https://github.com/mixmark-io/turndown) library for more reliable and accurate HTML to Markdown conversion
- Added GFM (GitHub Flavored Markdown) support via turndown-plugin-gfm for proper table rendering, strikethrough, and task lists

### Fixed

- **Title extraction** - Now correctly extracts article title from og:title or title tag, avoiding site logos/links
- **Paragraph separation** - Content no longer collapses into single paragraphs
- **Table conversion** - HTML tables now convert to proper Markdown tables instead of concatenated text
- **Content boundary detection** - Improved detection of article end (excludes share buttons, footer, comments)
- **HTML entity handling** - Better decoding of curly quotes, dashes, and other common entities

### Added

- Custom Turndown rules for WordPress block code handling
- Support for code blocks with syntax highlighting hints

---

## [1.2.0] - 2025-12-05

### Added

- **REST API fetch mode** - Fetch content from your own WordPress sites via REST API instead of HTML scraping
  - `ownwords fetch <url> --api` fetches via REST API with full metadata
  - `ownwords batch urls.txt --api` batch fetch multiple articles via API
  - Produces both Markdown (with enriched front matter) and JSON sidecar files
  - JSON sidecar stores complete API response for future bi-directional sync

- **Enriched front matter** when using `--api` mode:
  - `categories` and `tags` as YAML arrays with names
  - `author` field with author name
  - `featured_image` and `featured_image_alt` for featured media
  - `wordpress.post_id`, `wordpress.category_ids`, `wordpress.tag_ids`, `wordpress.author_id`
  - `wordpress.synced_at` timestamp for sync tracking

- **New WpClient methods** for programmatic REST API access:
  - `getPostBySlugWithEmbed(slug, type)` - fetch with embedded categories, tags, author, featured image
  - `getPostByIdWithEmbed(postId, type)` - fetch by ID with embedded data
  - `normalizeEmbedResponse(post)` - normalize _embed data to clean structure

- **New library functions**:
  - `fetchViaApi(urlOrSlug, outputDir, options)` - fetch single article via API
  - `fetchViaApiMultiple(urlsOrSlugs, outputDir, options)` - batch fetch via API
  - `generateEnrichedFrontMatter(normalized)` - generate YAML from API data

- **Content comparison utilities** for detecting content drift between local and remote:
  - `ownwords compare <file1> <file2>` - compare two markdown files
  - `ownwords compare-batch <mapping.json>` - compare multiple file pairs
  - `--normalize` flag to ignore typography differences (curly quotes, non-breaking spaces)
  - `--json` flag for machine-readable output
  - Detects: identical content, typography-only differences, structural differences
  - Analyzes: word counts, line counts, quote styles, special characters

- **New library functions for comparison**:
  - `compareFiles(path1, path2, options)` - compare two markdown files
  - `compareContent(content1, content2, options)` - compare markdown strings
  - `compareBatch(pairs, options)` - compare multiple file pairs
  - `generateCompareReport(comparison, options)` - generate human-readable report
  - `normalizeForComparison(text)` - normalize typography for comparison
  - `analyzeTypography(text1, text2)` - analyze typography differences

### Changed

- CLI help updated with REST API fetch examples and options

---

## [1.4.3] - 2025-12-09

### Fixed

- **Image sidecar format compatibility between fetch and publish** - The `fetch --api` command now creates image sidecar files (`index.images.json`) in the same format that `publish` expects. Previously, fetch created `{ images: [...] }` but publish expected `{ uploaded: {...} }`, causing images to be re-uploaded every time a fetched article was published.

### Added

- **`normalizeWordPressImageUrl()` function** - Converts Jetpack CDN URLs (e.g., `https://i0.wp.com/...`) back to direct WordPress URLs for proper image matching during publish
- Tests for `normalizeWordPressImageUrl()` covering all CDN variants and edge cases

### Changed

- **Image sidecar format is now documented in CLAUDE.md** as a data contract that both fetch and publish must adhere to

---

## [Unreleased]

### Planned

- Plugin system for custom converters
- Sync status tracking in front matter
