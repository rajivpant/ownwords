/**
 * @fileoverview ownwords - Own your words
 * @module ownwords
 *
 * Open source toolkit for authors who want to own their words.
 * Bi-directional WordPress sync, local Markdown editing, batch AI-assisted
 * editorial operations, and dual publishing to both WordPress and static sites.
 * Your content, your files, your control.
 */

const fetch = require('./fetch');
const fetchApi = require('./fetch-api');
const convert = require('./convert');
const verify = require('./verify');
const exportModule = require('./export');
const compare = require('./compare');
const { AgentAPI } = require('./agent-api');
const { WpClient } = require('./wp-api');
const config = require('./config');

// Re-export all functions from submodules
module.exports = {
  // Agent API
  AgentAPI,

  // WordPress API client
  WpClient,

  // Fetch functions (HTML scraping)
  fetchArticle: fetch.fetchArticle,
  fetchMultiple: fetch.fetchMultiple,
  extractSlugFromUrl: fetch.extractSlugFromUrl,

  // Fetch functions (REST API - v1.2.0)
  fetchViaApi: fetchApi.fetchViaApi,
  fetchViaApiMultiple: fetchApi.fetchViaApiMultiple,
  generateEnrichedFrontMatter: fetchApi.generateEnrichedFrontMatter,

  // Convert functions
  convertFile: convert.convertFile,
  convertHtml: convert.convertHtml,
  htmlToMarkdown: convert.htmlToMarkdown,
  extractArticleContent: convert.extractArticleContent,
  extractMetadata: convert.extractMetadata,
  cleanText: convert.cleanText,
  generateFrontMatter: convert.generateFrontMatter,

  // Verify functions
  verifyConversion: verify.verifyConversion,
  verifyBatch: verify.verifyBatch,
  validateFrontMatter: verify.validateFrontMatter,
  validateMarkdownStructure: verify.validateMarkdownStructure,

  // Extraction functions (for advanced use)
  extractTextFromHtml: verify.extractTextFromHtml,
  extractTextFromMarkdown: verify.extractTextFromMarkdown,
  extractHeadingsFromHtml: verify.extractHeadingsFromHtml,
  extractHeadingsFromMarkdown: verify.extractHeadingsFromMarkdown,
  extractUrlsFromHtml: verify.extractUrlsFromHtml,
  extractUrlsFromMarkdown: verify.extractUrlsFromMarkdown,

  // Export functions
  exportToWordPress: exportModule.exportToWordPress,
  exportBatch: exportModule.exportBatch,
  markdownToHtml: exportModule.markdownToHtml,

  // Configuration functions
  getWordPressSite: config.getWordPressSite,
  addWordPressSite: config.addWordPressSite,
  removeWordPressSite: config.removeWordPressSite,
  listWordPressSites: config.listWordPressSites,
  getConfigPath: config.getConfigPath,

  // Compare functions (content drift detection)
  compareFiles: compare.compareFiles,
  compareContent: compare.compareContent,
  compareBatch: compare.compareBatch,
  generateCompareReport: compare.generateReport,
  normalizeForComparison: compare.normalizeForComparison,
  analyzeTypography: compare.analyzeTypography
};
