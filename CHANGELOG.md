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

## [Unreleased]

### Planned

- TypeScript type definitions
- Plugin system for custom converters
- Sync status tracking in front matter
