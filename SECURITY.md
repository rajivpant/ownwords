# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in ownwords, please report it responsibly.

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, please email [security@rajiv.com](mailto:security@rajiv.com) with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We will respond within 48 hours and work with you to address the issue.

## Security Considerations

### Credential Storage

WordPress credentials are stored in `~/.config/ownwords/config.json`:
- File permissions are set to `600` (owner read/write only)
- Never commit this file to version control
- For CI/CD, use environment variables instead:
  - `OWNWORDS_WP_SITE`
  - `OWNWORDS_WP_USERNAME`
  - `OWNWORDS_WP_PASSWORD`

### Network Security

- All WordPress API calls use HTTPS
- Application Passwords are used instead of main account passwords
- Credentials are transmitted via Basic Auth over TLS

### Best Practices

1. **Use Application Passwords**: Create dedicated WordPress Application Passwords for ownwords rather than using your main account password
2. **Limit Permissions**: Create a WordPress user with only the permissions needed for publishing
3. **Revoke When Done**: Remove unused Application Passwords from your WordPress profile
4. **Audit Access**: Periodically review `~/.config/ownwords/config.json` for stale credentials

### What We Don't Store

ownwords never stores or transmits:
- Your main WordPress account password
- Session cookies or tokens
- Personal data beyond what's in your markdown files
