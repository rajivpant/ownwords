# Contributing to ownwords

Thank you for your interest in contributing to ownwords!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/rajivpant/ownwords.git
   cd ownwords
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests to verify setup:
   ```bash
   npm test
   ```

## Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Add or update tests for your changes

4. Run the linter and fix any issues:
   ```bash
   npm run lint
   ```

5. Run tests to ensure everything passes:
   ```bash
   npm test
   ```

6. Commit your changes with a clear message

7. Submit a pull request

## Code Style

- We use ESLint for code quality
- Run `npm run lint` before committing
- Follow existing code patterns
- Use JSDoc comments for public functions
- Keep functions focused and single-purpose

## Testing

- Write tests using Node.js native test runner (`node:test`)
- Place test files in the `test/` directory with `.test.js` extension
- Aim for good coverage of edge cases
- Run tests with `npm test`

## Pull Request Guidelines

- Provide a clear description of what your PR does
- Reference any related issues
- Keep PRs focused on a single change
- Ensure CI passes before requesting review

## Reporting Issues

Please use [GitHub Issues](https://github.com/rajivpant/ownwords/issues) to report bugs or request features.

When reporting bugs, please include:
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## Questions?

Feel free to open an issue for questions or discussions.
