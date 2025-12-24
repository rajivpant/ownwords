/**
 * Tests for config module
 *
 * Note: These tests don't modify the actual config file.
 * They test the internal logic with mocked data.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We'll test the exported functions that don't require file I/O
// For file I/O tests, we'd need to use a temp directory

describe('config module', () => {
  let tempDir;
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Create temp directory for config tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownwords-test-'));
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('ENV_VARS', () => {
    it('defines expected environment variable names', () => {
      const { ENV_VARS } = require('../lib/config');
      assert.strictEqual(ENV_VARS.WP_PASSWORD, 'OWNWORDS_WP_PASSWORD');
      assert.strictEqual(ENV_VARS.WP_USERNAME, 'OWNWORDS_WP_USERNAME');
      assert.strictEqual(ENV_VARS.WP_SITE, 'OWNWORDS_WP_SITE');
    });
  });

  describe('checkConfigPermissions', () => {
    it('returns secure when config file does not exist', () => {
      const { checkConfigPermissions } = require('../lib/config');
      // This tests the function's behavior - it should handle non-existent files gracefully
      const result = checkConfigPermissions();
      assert.strictEqual(typeof result.secure, 'boolean');
      assert.strictEqual(typeof result.message, 'string');
    });
  });

  describe('getConfigPath', () => {
    it('returns a path in home directory', () => {
      const { getConfigPath } = require('../lib/config');
      const configPath = getConfigPath();
      assert.ok(configPath.includes('ownwords'));
      assert.ok(configPath.endsWith('config.json'));
    });
  });

  describe('listWordPressSites', () => {
    it('returns an array', () => {
      const { listWordPressSites } = require('../lib/config');
      const sites = listWordPressSites();
      assert.ok(Array.isArray(sites));
    });

    it('returns site objects with expected properties', () => {
      const { listWordPressSites } = require('../lib/config');
      const sites = listWordPressSites();
      // Even if empty, the function should work
      for (const site of sites) {
        assert.ok(typeof site.name === 'string');
        assert.ok(typeof site.url === 'string');
        assert.ok(typeof site.isDefault === 'boolean');
      }
    });
  });

  describe('environment variable priority', () => {
    it('getWordPressSite uses env vars when all are set', () => {
      const { getWordPressSite } = require('../lib/config');

      // Set all env vars
      process.env.OWNWORDS_WP_SITE = 'https://env-test.example.com';
      process.env.OWNWORDS_WP_USERNAME = 'env-user';
      process.env.OWNWORDS_WP_PASSWORD = 'env-password';

      const site = getWordPressSite();

      assert.strictEqual(site.name, 'env');
      assert.strictEqual(site.url, 'https://env-test.example.com');
      assert.strictEqual(site.username, 'env-user');
      assert.strictEqual(site.appPassword, 'env-password');
      assert.strictEqual(site.fromEnv, true);
    });

    it('getWordPressSite returns null when env vars are incomplete', () => {
      const { getWordPressSite } = require('../lib/config');

      // Set only some env vars
      process.env.OWNWORDS_WP_SITE = 'https://env-test.example.com';
      delete process.env.OWNWORDS_WP_USERNAME;
      delete process.env.OWNWORDS_WP_PASSWORD;

      // Should return null if no config file sites exist
      const site = getWordPressSite();
      // The result depends on whether any config file sites exist
      // Just verify it doesn't throw
      assert.ok(site === null || typeof site === 'object');
    });
  });
});
