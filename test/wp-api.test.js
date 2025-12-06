/**
 * Tests for wp-api module
 *
 * Tests the WpClient class constructor and validation.
 * HTTP request tests would require mocking.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { WpClient } = require('../lib/wp-api');

describe('WpClient', () => {
  describe('constructor', () => {
    it('creates client with valid options', () => {
      const client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'xxxx xxxx xxxx xxxx'
      });

      assert.strictEqual(client.url, 'https://example.com');
      assert.strictEqual(client.username, 'testuser');
      assert.strictEqual(client.appPassword, 'xxxx xxxx xxxx xxxx');
    });

    it('removes trailing slash from URL', () => {
      const client = new WpClient({
        url: 'https://example.com/',
        username: 'testuser',
        appPassword: 'xxxx xxxx xxxx xxxx'
      });

      assert.strictEqual(client.url, 'https://example.com');
    });

    it('throws error when URL is missing', () => {
      assert.throws(() => {
        new WpClient({
          username: 'testuser',
          appPassword: 'xxxx xxxx xxxx xxxx'
        });
      }, /WordPress URL is required/);
    });

    it('throws error when username is missing', () => {
      assert.throws(() => {
        new WpClient({
          url: 'https://example.com',
          appPassword: 'xxxx xxxx xxxx xxxx'
        });
      }, /WordPress username is required/);
    });

    it('throws error when appPassword is missing', () => {
      assert.throws(() => {
        new WpClient({
          url: 'https://example.com',
          username: 'testuser'
        });
      }, /WordPress application password is required/);
    });

    it('creates Basic Auth header', () => {
      const client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });

      assert.ok(client.authHeader.startsWith('Basic '));

      // Verify Base64 encoding
      const encoded = client.authHeader.substring(6);
      const decoded = Buffer.from(encoded, 'base64').toString();
      assert.strictEqual(decoded, 'testuser:secret');
    });
  });

  describe('instance methods exist', () => {
    let client;

    it('has testConnection method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.testConnection, 'function');
    });

    it('has createPost method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.createPost, 'function');
    });

    it('has updatePost method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.updatePost, 'function');
    });

    it('has getPostById method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.getPostById, 'function');
    });

    it('has getPostBySlug method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.getPostBySlug, 'function');
    });

    it('has deletePost method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.deletePost, 'function');
    });

    it('has getCategories method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.getCategories, 'function');
    });

    it('has getTags method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.getTags, 'function');
    });

    it('has publishMarkdown method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.publishMarkdown, 'function');
    });

    it('has syncMarkdown method', () => {
      client = new WpClient({
        url: 'https://example.com',
        username: 'testuser',
        appPassword: 'secret'
      });
      assert.strictEqual(typeof client.syncMarkdown, 'function');
    });
  });
});
