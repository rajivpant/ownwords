/**
 * @fileoverview WordPress REST API client for ownwords
 * @module ownwords/wp-api
 *
 * Provides a client for publishing and managing WordPress posts
 * via the REST API using Application Passwords for authentication.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { exportToWordPress } = require('./export');

/**
 * WordPress REST API client
 *
 * @class WpClient
 * @example
 * const client = new WpClient({
 *   url: 'https://example.com',
 *   username: 'author',
 *   appPassword: 'xxxx xxxx xxxx xxxx'
 * });
 *
 * await client.createPost({
 *   title: 'My Post',
 *   content: '<p>Hello world</p>',
 *   status: 'publish'
 * });
 */
class WpClient {
  /**
   * Create a WordPress client
   *
   * @param {Object} options - Client options
   * @param {string} options.url - WordPress site URL
   * @param {string} options.username - WordPress username
   * @param {string} options.appPassword - WordPress application password
   */
  constructor(options) {
    if (!options.url) {
      throw new Error('WordPress URL is required');
    }
    if (!options.username) {
      throw new Error('WordPress username is required');
    }
    if (!options.appPassword) {
      throw new Error('WordPress application password is required');
    }

    this.url = options.url.replace(/\/$/, '');
    this.username = options.username;
    this.appPassword = options.appPassword;

    // Create Basic Auth header
    const credentials = Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Make an HTTP request to the WordPress REST API
   *
   * @private
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint (e.g., '/wp/v2/posts')
   * @param {Object} [data] - Request body data
   * @returns {Promise<Object>} Response data
   */
  async _request(method, endpoint, data = null) {
    const apiUrl = new URL(`${this.url}/wp-json${endpoint}`);
    const isHttps = apiUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: apiUrl.hostname,
      port: apiUrl.port || (isHttps ? 443 : 80),
      path: apiUrl.pathname + apiUrl.search,
      method: method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const response = body ? JSON.parse(body) : {};

            if (res.statusCode >= 400) {
              const error = new Error(response.message || `HTTP ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.code = response.code;
              error.data = response.data;
              reject(error);
            } else {
              resolve(response);
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      // Set timeout
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Test the connection to WordPress
   *
   * @returns {Promise<{success: boolean, user: Object}>} Connection test result
   */
  async testConnection() {
    try {
      const user = await this._request('GET', '/wp/v2/users/me');
      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          slug: user.slug
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new post
   *
   * @param {Object} postData - Post data
   * @param {string} postData.title - Post title
   * @param {string} postData.content - Post content (HTML)
   * @param {string} [postData.slug] - URL slug
   * @param {string} [postData.status='draft'] - Post status (draft, publish, future, private)
   * @param {string} [postData.excerpt] - Post excerpt
   * @param {number[]} [postData.categories] - Category IDs
   * @param {number[]} [postData.tags] - Tag IDs
   * @param {string} [postData.date] - Publish date (ISO 8601)
   * @returns {Promise<Object>} Created post
   */
  async createPost(postData) {
    const data = {
      title: postData.title,
      content: postData.content,
      status: postData.status || 'draft'
    };

    if (postData.slug) data.slug = postData.slug;
    if (postData.excerpt) data.excerpt = postData.excerpt;
    if (postData.categories) data.categories = postData.categories;
    if (postData.tags) data.tags = postData.tags;
    if (postData.date) data.date = postData.date;

    return this._request('POST', '/wp/v2/posts', data);
  }

  /**
   * Update an existing post
   *
   * @param {number} postId - Post ID
   * @param {Object} postData - Post data to update
   * @returns {Promise<Object>} Updated post
   */
  async updatePost(postId, postData) {
    const data = {};

    if (postData.title !== undefined) data.title = postData.title;
    if (postData.content !== undefined) data.content = postData.content;
    if (postData.slug !== undefined) data.slug = postData.slug;
    if (postData.status !== undefined) data.status = postData.status;
    if (postData.excerpt !== undefined) data.excerpt = postData.excerpt;
    if (postData.categories !== undefined) data.categories = postData.categories;
    if (postData.tags !== undefined) data.tags = postData.tags;
    if (postData.date !== undefined) data.date = postData.date;

    return this._request('POST', `/wp/v2/posts/${postId}`, data);
  }

  /**
   * Get a post by ID
   *
   * @param {number} postId - Post ID
   * @returns {Promise<Object>} Post data
   */
  async getPostById(postId) {
    return this._request('GET', `/wp/v2/posts/${postId}`);
  }

  /**
   * Get a post by slug
   *
   * @param {string} slug - Post slug
   * @returns {Promise<Object|null>} Post data or null if not found
   */
  async getPostBySlug(slug) {
    const posts = await this._request('GET', `/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=any`);

    if (Array.isArray(posts) && posts.length > 0) {
      return posts[0];
    }

    return null;
  }

  /**
   * Delete a post
   *
   * @param {number} postId - Post ID
   * @param {boolean} [force=false] - Bypass trash and force delete
   * @returns {Promise<Object>} Deleted post
   */
  async deletePost(postId, force = false) {
    return this._request('DELETE', `/wp/v2/posts/${postId}?force=${force}`);
  }

  /**
   * Get all categories
   *
   * @returns {Promise<Array>} List of categories
   */
  async getCategories() {
    return this._request('GET', '/wp/v2/categories?per_page=100');
  }

  /**
   * Get category ID by name (creates if not exists)
   *
   * @param {string} name - Category name
   * @returns {Promise<number>} Category ID
   */
  async getCategoryId(name) {
    const categories = await this._request('GET', `/wp/v2/categories?search=${encodeURIComponent(name)}`);

    const exact = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      return exact.id;
    }

    // Category not found - return null (don't create automatically)
    return null;
  }

  /**
   * Get all tags
   *
   * @returns {Promise<Array>} List of tags
   */
  async getTags() {
    return this._request('GET', '/wp/v2/tags?per_page=100');
  }

  /**
   * Get tag ID by name (creates if not exists)
   *
   * @param {string} name - Tag name
   * @returns {Promise<number>} Tag ID
   */
  async getTagId(name) {
    const tags = await this._request('GET', `/wp/v2/tags?search=${encodeURIComponent(name)}`);

    const exact = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      return exact.id;
    }

    // Tag not found - return null (don't create automatically)
    return null;
  }

  /**
   * Publish a markdown file to WordPress
   *
   * @param {string} mdPath - Path to markdown file
   * @param {Object} [options] - Publish options
   * @param {string} [options.status='draft'] - Post status
   * @param {boolean} [options.update=false] - Update existing post if found by slug
   * @returns {Promise<Object>} Publish result
   */
  async publishMarkdown(mdPath, options = {}) {
    const { status = 'draft', update = false } = options;

    // Export markdown to HTML
    const exported = exportToWordPress(mdPath, null, {
      includeWrapper: false,
      outputToFile: false
    });

    const { title, slug, html, metadata } = exported;

    // Check if post exists
    let existingPost = null;
    if (update && slug) {
      existingPost = await this.getPostBySlug(slug);
    }

    // Resolve category IDs
    // Priority: categories (names) > wordpress.categories (names) > wordpress.category_ids (numeric)
    // We prefer names because they're the source of truth; IDs are cached and may be stale
    let categoryIds = [];
    if (metadata.categories && Array.isArray(metadata.categories)) {
      const ids = await Promise.all(
        metadata.categories.map(name => this.getCategoryId(name))
      );
      categoryIds = ids.filter(id => id !== null);
    } else if (metadata.wordpress?.categories) {
      const ids = await Promise.all(
        metadata.wordpress.categories.map(name => this.getCategoryId(name))
      );
      categoryIds = ids.filter(id => id !== null);
    } else if (metadata.wordpress?.category_ids && Array.isArray(metadata.wordpress.category_ids)) {
      categoryIds = metadata.wordpress.category_ids;
    }

    // Resolve tag IDs
    // Priority: tags (names) > wordpress.tags (names) > wordpress.tag_ids (numeric)
    // We prefer names because they're the source of truth; IDs are cached and may be stale
    let tagIds = [];
    if (metadata.tags && Array.isArray(metadata.tags)) {
      const ids = await Promise.all(
        metadata.tags.map(name => this.getTagId(name))
      );
      tagIds = ids.filter(id => id !== null);
    } else if (metadata.wordpress?.tags) {
      const ids = await Promise.all(
        metadata.wordpress.tags.map(name => this.getTagId(name))
      );
      tagIds = ids.filter(id => id !== null);
    } else if (metadata.wordpress?.tag_ids && Array.isArray(metadata.wordpress.tag_ids)) {
      tagIds = metadata.wordpress.tag_ids;
    }

    const postData = {
      title,
      content: html,
      slug,
      status,
      excerpt: metadata.description || metadata.wordpress?.excerpt,
      categories: categoryIds.length > 0 ? categoryIds : undefined,
      tags: tagIds.length > 0 ? tagIds : undefined
    };

    let result;
    if (existingPost) {
      result = await this.updatePost(existingPost.id, postData);
      return {
        action: 'updated',
        postId: result.id,
        slug: result.slug,
        link: result.link,
        status: result.status
      };
    } else {
      result = await this.createPost(postData);
      return {
        action: 'created',
        postId: result.id,
        slug: result.slug,
        link: result.link,
        status: result.status
      };
    }
  }

  /**
   * Sync a markdown file to WordPress (smart create/update)
   *
   * @param {string} mdPath - Path to markdown file
   * @param {Object} [options] - Sync options
   * @param {string} [options.status] - Override post status
   * @returns {Promise<Object>} Sync result
   */
  async syncMarkdown(mdPath, options = {}) {
    return this.publishMarkdown(mdPath, { ...options, update: true });
  }

  // ============================================================
  // REST API Fetch Methods (v1.2.0)
  // Use _embed parameter to get categories, tags, author, featured image
  // ============================================================

  /**
   * Get a post by slug with embedded data
   *
   * Uses the _embed parameter to include:
   * - Author details
   * - Categories and tags (wp:term)
   * - Featured image (wp:featuredmedia)
   *
   * @param {string} slug - Post slug
   * @param {string} [type='posts'] - Content type ('posts' or 'pages')
   * @returns {Promise<Object|null>} Post with embedded data or null if not found
   */
  async getPostBySlugWithEmbed(slug, type = 'posts') {
    const endpoint = type === 'pages' ? 'pages' : 'posts';
    const posts = await this._request(
      'GET',
      `/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&status=any&_embed`
    );

    if (Array.isArray(posts) && posts.length > 0) {
      return posts[0];
    }

    return null;
  }

  /**
   * Get a post by ID with embedded data
   *
   * @param {number} postId - Post ID
   * @param {string} [type='posts'] - Content type ('posts' or 'pages')
   * @returns {Promise<Object>} Post with embedded data
   */
  async getPostByIdWithEmbed(postId, type = 'posts') {
    const endpoint = type === 'pages' ? 'pages' : 'posts';
    return this._request('GET', `/wp/v2/${endpoint}/${postId}?_embed`);
  }

  /**
   * Normalize a WordPress REST API response with _embed data
   *
   * Extracts and flattens embedded data into a clean, consistent structure
   * suitable for front matter generation and JSON sidecar storage.
   *
   * @param {Object} post - WordPress post object with _embedded data
   * @returns {Object} Normalized post data
   */
  normalizeEmbedResponse(post) {
    if (!post) {
      return null;
    }

    const embedded = post._embedded || {};

    return {
      id: post.id,
      slug: post.slug,
      title: this._extractRendered(post.title),
      content: this._extractRendered(post.content),
      excerpt: this._extractRendered(post.excerpt),
      date: post.date ? post.date.substring(0, 10) : '',
      dateGmt: post.date_gmt || '',
      modified: post.modified ? post.modified.substring(0, 10) : '',
      modifiedGmt: post.modified_gmt || '',
      status: post.status,
      type: post.type,
      link: post.link,
      author: this._extractAuthor(embedded),
      categories: this._extractTerms(embedded, 'category'),
      tags: this._extractTerms(embedded, 'post_tag'),
      featuredImage: this._extractFeaturedImage(embedded),
      format: post.format || 'standard',
      meta: post.meta || {}
    };
  }

  /**
   * Extract rendered content from WordPress object
   *
   * @private
   * @param {Object|string} field - WordPress field with rendered property
   * @returns {string} Rendered content
   */
  _extractRendered(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field.rendered || '';
  }

  /**
   * Extract author information from embedded data
   *
   * @private
   * @param {Object} embedded - WordPress _embedded object
   * @returns {Object} Author info with id, name, slug, avatar
   */
  _extractAuthor(embedded) {
    const authors = embedded.author;
    if (!authors || !Array.isArray(authors) || authors.length === 0) {
      return { id: 0, name: '', slug: '', avatar: '' };
    }

    const author = authors[0];
    return {
      id: author.id || 0,
      name: author.name || '',
      slug: author.slug || '',
      avatar: author.avatar_urls?.['96'] || author.avatar_urls?.['48'] || ''
    };
  }

  /**
   * Extract terms (categories or tags) from embedded data
   *
   * @private
   * @param {Object} embedded - WordPress _embedded object
   * @param {string} taxonomy - Taxonomy name ('category' or 'post_tag')
   * @returns {Array<{id: number, name: string, slug: string}>} Array of terms
   */
  _extractTerms(embedded, taxonomy) {
    const wpTerms = embedded['wp:term'];
    if (!wpTerms || !Array.isArray(wpTerms)) {
      return [];
    }

    // wp:term is an array of arrays - each inner array is a taxonomy
    const terms = [];
    for (const termGroup of wpTerms) {
      if (!Array.isArray(termGroup)) continue;

      for (const term of termGroup) {
        if (term.taxonomy === taxonomy) {
          terms.push({
            id: term.id,
            name: term.name,
            slug: term.slug
          });
        }
      }
    }

    return terms;
  }

  /**
   * Extract featured image from embedded data
   *
   * @private
   * @param {Object} embedded - WordPress _embedded object
   * @returns {Object|null} Featured image info or null
   */
  _extractFeaturedImage(embedded) {
    const media = embedded['wp:featuredmedia'];
    if (!media || !Array.isArray(media) || media.length === 0) {
      return null;
    }

    const image = media[0];
    if (!image || image.code === 'rest_post_invalid_id') {
      return null;
    }

    // Get the best available URL (prefer full size)
    let url = image.source_url || '';
    if (image.media_details?.sizes?.full?.source_url) {
      url = image.media_details.sizes.full.source_url;
    }

    return {
      id: image.id || 0,
      url: url,
      alt: image.alt_text || '',
      title: this._extractRendered(image.title),
      width: image.media_details?.width || 0,
      height: image.media_details?.height || 0
    };
  }
}

module.exports = {
  WpClient
};
