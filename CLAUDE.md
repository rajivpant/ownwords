# Claude Code Context: ownwords

## Repository: ownwords (PUBLIC)

Own your words. Open source toolkit for authors who want to own their words. Bi-directional WordPress sync, local Markdown editing, batch AI-assisted editorial operations, and dual publishing to both WordPress and static sites. Your content, your files, your control.

## Purpose

This is a **standalone npm package** that can be used with any WordPress site.
It is NOT tied to any specific website project.

## Repository Location

`~/projects/my-projects/ownwords/`

## Usage with Other Projects

ownwords can be used as a dependency or development tool for any website:
- synthesis-coding-site
- ragbot-site
- ragenie-site
- Any WordPress-to-static-site workflow

## Git Operations

**IMPORTANT**: This is a separate repository from any website projects.

Before any git commands, ensure you are in the correct directory:
```bash
cd ~/projects/my-projects/ownwords
```

Do NOT commit ownwords changes to website repos or vice versa.

## CLI Commands

```bash
ownwords fetch <url>              # Fetch WordPress article
ownwords convert <html> [md]      # Convert to Markdown
ownwords verify <html> <md>       # Verify conversion
ownwords batch <urls-file>        # Batch convert
ownwords export <md>              # Export to WordPress HTML
```

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
# Install dependencies (none currently)
npm install

# Link for local CLI testing
npm link

# Test CLI
ownwords --version
ownwords --help
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
