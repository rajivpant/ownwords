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

## [Unreleased]

### Planned

- **REST API fetch mode** - For your own WordPress sites, fetch content via REST API instead of scraping HTML. Benefits:
  - Clean structured data (title, content, excerpt)
  - Full metadata (categories, tags, author, custom fields)
  - Bi-directional sync with tag/category normalization
  - No HTML parsing needed
- TypeScript type definitions
- Plugin system for custom converters
- Sync status tracking in front matter
