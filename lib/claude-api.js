/**
 * @fileoverview Claude API client for AI-powered content analysis
 * @module ownwords/claude-api
 *
 * Provides integration with Anthropic's Claude API for intelligent
 * content analysis tasks like tag suggestion, categorization, and
 * content summarization.
 */

const https = require('https');
const { readConfig, writeConfig } = require('./config');

/**
 * Environment variable names for Claude API
 * @constant {Object}
 */
const ENV_VARS = {
  CLAUDE_API_KEY: 'OWNWORDS_CLAUDE_API_KEY',
  CLAUDE_MODEL: 'OWNWORDS_CLAUDE_MODEL'
};

/**
 * Default model to use
 * @constant {string}
 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Claude API client for content analysis
 */
class ClaudeClient {
  /**
   * Create a ClaudeClient instance
   *
   * @param {Object} [options] - Configuration options
   * @param {string} [options.apiKey] - Claude API key (or use env var OWNWORDS_CLAUDE_API_KEY)
   * @param {string} [options.model] - Model to use (default: claude-sonnet-4-20250514)
   *
   * @example
   * const client = new ClaudeClient();
   * const client = new ClaudeClient({ apiKey: 'sk-ant-...' });
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || this._getApiKey();
    this.model = options.model || process.env[ENV_VARS.CLAUDE_MODEL] || DEFAULT_MODEL;

    if (!this.apiKey) {
      throw new Error(
        'Claude API key not found. Set OWNWORDS_CLAUDE_API_KEY environment variable ' +
        'or configure via: ownwords config-claude set-key'
      );
    }
  }

  /**
   * Get API key from environment or config
   * @private
   */
  _getApiKey() {
    // Priority 1: Environment variable
    if (process.env[ENV_VARS.CLAUDE_API_KEY]) {
      return process.env[ENV_VARS.CLAUDE_API_KEY];
    }

    // Priority 2: Config file
    const config = readConfig();
    if (config.claude && config.claude.apiKey) {
      return config.claude.apiKey;
    }

    return null;
  }

  /**
   * Make a request to the Claude API
   * @private
   */
  async _request(messages, options = {}) {
    const maxTokens = options.maxTokens || 4096;

    const requestBody = {
      model: this.model,
      max_tokens: maxTokens,
      messages
    };

    if (options.system) {
      requestBody.system = options.system;
    }

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestBody);

      const requestOptions = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(requestOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);

            if (res.statusCode !== 200) {
              reject(new Error(
                `Claude API error (${res.statusCode}): ${response.error?.message || body}`
              ));
              return;
            }

            resolve(response);
          } catch (e) {
            reject(new Error(`Failed to parse Claude API response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Extract text content from Claude API response
   * @private
   */
  _extractText(response) {
    if (response.content && response.content.length > 0) {
      return response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    }
    return '';
  }

  /**
   * Analyze an article and suggest tags
   *
   * @param {Object} article - Article to analyze
   * @param {string} article.title - Article title
   * @param {string} article.body - Article content (can be truncated)
   * @param {string} [article.description] - Article excerpt/description
   * @param {string[]} [article.existingTags] - Current tags on the article
   * @returns {Promise<Object>} Tag suggestions with reasoning
   *
   * @example
   * const suggestions = await client.suggestTags({
   *   title: 'Building AI Agents with Claude',
   *   body: 'This article explores...',
   *   existingTags: ['AI', 'programming']
   * });
   */
  async suggestTags(article) {
    const { title, body, description, existingTags = [] } = article;

    const systemPrompt = `You are an expert content taxonomist helping to organize a personal blog.
Your task is to analyze articles and suggest the most relevant, descriptive tags.

Guidelines for tag suggestions:
1. Tags should describe what the article is ABOUT, not superficial mentions
2. Prefer specific tags over generic ones (e.g., "machine learning" over "technology" if the article is specifically about ML)
3. Include both topic tags (what it's about) and type tags (e.g., "book review", "tutorial", "personal story")
4. Suggest 3-8 tags per article - enough to be discoverable, not so many as to be meaningless
5. Use lowercase for multi-word tags (e.g., "machine learning", "software engineering")
6. Use standard industry terminology where applicable
7. Consider the author's perspective and expertise level shown in the content

Output format: Return a JSON object with this structure:
{
  "suggestedTags": ["tag1", "tag2", ...],
  "reasoning": "Brief explanation of why these tags were chosen",
  "confidence": "high" | "medium" | "low",
  "primaryTopic": "The main subject of the article in 2-3 words"
}`;

    const userPrompt = `Analyze this article and suggest appropriate tags:

Title: ${title}

${description ? `Description: ${description}\n` : ''}
${existingTags.length > 0 ? `Current tags: ${existingTags.join(', ')}\n` : ''}
Content:
${body.substring(0, 8000)}${body.length > 8000 ? '\n\n[Content truncated...]' : ''}

Please analyze this article and suggest the most appropriate tags.`;

    const response = await this._request(
      [{ role: 'user', content: userPrompt }],
      { system: systemPrompt, maxTokens: 1024 }
    );

    const text = this._extractText(response);

    // Parse JSON from response (handle markdown code blocks)
    try {
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                        text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      return JSON.parse(jsonStr);
    } catch (e) {
      // If JSON parsing fails, return raw response with structure
      return {
        suggestedTags: [],
        reasoning: text,
        confidence: 'low',
        primaryTopic: 'unknown',
        parseError: true
      };
    }
  }

  /**
   * Synthesize a unified taxonomy from individual tag suggestions
   *
   * @param {Object[]} tagSuggestions - Array of tag suggestions from suggestTags()
   * @param {Object} [options] - Options
   * @param {number} [options.maxTags=100] - Maximum number of tags in taxonomy
   * @returns {Promise<Object>} Unified taxonomy with tag definitions
   *
   * @example
   * const taxonomy = await client.synthesizeTaxonomy(allSuggestions, { maxTags: 80 });
   */
  async synthesizeTaxonomy(tagSuggestions, options = {}) {
    const maxTags = options.maxTags || 100;

    // Aggregate all suggested tags with frequency
    const tagFrequency = {};
    const tagContexts = {};

    for (const suggestion of tagSuggestions) {
      const tags = suggestion.suggestedTags || [];
      const title = suggestion.articleTitle || 'Unknown';

      for (const tag of tags) {
        const normalized = tag.toLowerCase().trim();
        tagFrequency[normalized] = (tagFrequency[normalized] || 0) + 1;
        if (!tagContexts[normalized]) {
          tagContexts[normalized] = [];
        }
        tagContexts[normalized].push(title);
      }
    }

    // Sort by frequency
    const sortedTags = Object.entries(tagFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200); // Send top 200 for consolidation

    const systemPrompt = `You are an expert in information architecture and content taxonomy.
Your task is to create a clean, well-organized tag taxonomy for a personal blog.

The blog contains articles about:
- Technology and software engineering
- Leadership and management
- AI and machine learning
- Media and journalism
- Personal reflections and family
- Career development
- Book reviews
- Travel

Guidelines for taxonomy design:
1. Merge synonyms and near-duplicates into canonical forms
2. Choose the most widely-used form for each concept
3. Prefer clarity over brevity (e.g., "artificial intelligence" over "AI" for consistency)
4. Remove tags that are too specific (used only 1-2 times) unless they serve a real purpose
5. Remove tags that are too generic to be useful for navigation
6. Create a hierarchy where appropriate (indicate parent-child relationships)
7. Aim for ${maxTags} or fewer tags total
8. Every tag should help readers find related content

Output format: Return a JSON object with this structure:
{
  "taxonomy": [
    {
      "tag": "canonical tag name",
      "aliases": ["other names that should map to this tag"],
      "description": "What articles with this tag are about",
      "parent": "parent tag if hierarchical, or null"
    }
  ],
  "merges": {
    "old-tag": "canonical-tag",
    ...
  },
  "removed": ["tags that should be removed and why"],
  "stats": {
    "originalCount": number,
    "finalCount": number,
    "mergeCount": number
  }
}`;

    const tagList = sortedTags.map(([tag, count]) => {
      const examples = tagContexts[tag].slice(0, 3).join(', ');
      return `- "${tag}" (${count} articles) - Examples: ${examples}`;
    }).join('\n');

    const userPrompt = `Here are the tags suggested across ${tagSuggestions.length} articles, sorted by frequency:

${tagList}

Please create a unified, clean taxonomy from these suggestions. Merge duplicates, remove noise, and organize into a coherent structure.`;

    const response = await this._request(
      [{ role: 'user', content: userPrompt }],
      { system: systemPrompt, maxTokens: 4096 }
    );

    const text = this._extractText(response);

    try {
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                        text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      return JSON.parse(jsonStr);
    } catch (e) {
      return {
        taxonomy: [],
        merges: {},
        removed: [],
        stats: { originalCount: sortedTags.length, finalCount: 0, mergeCount: 0 },
        rawResponse: text,
        parseError: true
      };
    }
  }

  /**
   * Assign tags to an article from an approved taxonomy
   *
   * @param {Object} article - Article to tag
   * @param {Object} taxonomy - Approved taxonomy from synthesizeTaxonomy()
   * @param {Object} [options] - Options
   * @returns {Promise<Object>} Final tag assignments
   */
  async assignTagsFromTaxonomy(article, taxonomy, options = {}) {
    const { title, body, description } = article;

    // Build taxonomy reference
    const tagList = taxonomy.taxonomy.map(t => {
      let entry = `- ${t.tag}`;
      if (t.description) entry += `: ${t.description}`;
      if (t.parent) entry += ` (under: ${t.parent})`;
      return entry;
    }).join('\n');

    const systemPrompt = `You are assigning tags to a blog article from an approved taxonomy.

IMPORTANT: You may ONLY use tags from the approved list below. Do not suggest any tags not on this list.

Approved Tags:
${tagList}

Guidelines:
1. Select 3-8 tags that accurately describe this article
2. Only use tags from the approved list above
3. Choose tags based on what the article is genuinely ABOUT, not superficial mentions
4. Include a mix of specific and broader tags where appropriate

Output format: Return a JSON object:
{
  "assignedTags": ["tag1", "tag2", ...],
  "reasoning": "Brief explanation"
}`;

    const userPrompt = `Assign tags to this article:

Title: ${title}
${description ? `Description: ${description}\n` : ''}

Content:
${body.substring(0, 6000)}${body.length > 6000 ? '\n\n[Content truncated...]' : ''}`;

    const response = await this._request(
      [{ role: 'user', content: userPrompt }],
      { system: systemPrompt, maxTokens: 512 }
    );

    const text = this._extractText(response);

    try {
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                        text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      return JSON.parse(jsonStr);
    } catch (e) {
      return {
        assignedTags: [],
        reasoning: text,
        parseError: true
      };
    }
  }

  /**
   * Test the API connection
   *
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      const response = await this._request(
        [{ role: 'user', content: 'Say "Connection successful" and nothing else.' }],
        { maxTokens: 50 }
      );

      const text = this._extractText(response);
      return {
        success: true,
        model: this.model,
        message: text
      };
    } catch (error) {
      return {
        success: false,
        model: this.model,
        error: error.message
      };
    }
  }
}

/**
 * Save Claude API key to config
 *
 * @param {string} apiKey - The API key to save
 */
function saveClaudeApiKey(apiKey) {
  const config = readConfig();
  if (!config.claude) {
    config.claude = {};
  }
  config.claude.apiKey = apiKey;
  writeConfig(config);
}

/**
 * Remove Claude API key from config
 */
function removeClaudeApiKey() {
  const config = readConfig();
  if (config.claude) {
    delete config.claude.apiKey;
    writeConfig(config);
  }
}

/**
 * Check if Claude API key is configured
 *
 * @returns {Object} Status of API key configuration
 */
function checkClaudeConfig() {
  const envKey = process.env[ENV_VARS.CLAUDE_API_KEY];
  const config = readConfig();
  const configKey = config.claude?.apiKey;

  return {
    configured: !!(envKey || configKey),
    source: envKey ? 'environment' : (configKey ? 'config' : 'none'),
    model: process.env[ENV_VARS.CLAUDE_MODEL] || DEFAULT_MODEL
  };
}

module.exports = {
  ClaudeClient,
  saveClaudeApiKey,
  removeClaudeApiKey,
  checkClaudeConfig,
  ENV_VARS,
  DEFAULT_MODEL
};
