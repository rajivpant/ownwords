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

## Git Operations

This is a standalone repository. If you're using ownwords alongside other site repositories, ensure you're in the correct directory before any git commands.

## Contributing

This is open source software (MIT license). Contributions are welcome.
