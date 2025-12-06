/**
 * ownwords - Own your words
 *
 * WordPress to Markdown conversion toolkit for human authors.
 */

declare module 'ownwords' {
  // ============================================================================
  // Fetch Module
  // ============================================================================

  /**
   * Extract the slug from a WordPress URL
   */
  export function extractSlugFromUrl(url: string): string | null;

  /**
   * Fetch a WordPress article and save the raw HTML
   */
  export function fetchArticle(
    url: string,
    outputPath: string,
    options?: {
      silent?: boolean;
      timeout?: number;
    }
  ): string;

  /**
   * Fetch multiple WordPress articles
   */
  export function fetchMultiple(
    urls: string[],
    outputDir: string,
    options?: {
      silent?: boolean;
      continueOnError?: boolean;
    }
  ): Array<{
    url: string;
    slug: string | null;
    outputPath: string | null;
    success: boolean;
    error?: string;
  }>;

  // ============================================================================
  // Convert Module
  // ============================================================================

  export interface ConvertOptions {
    slug?: string;
    title?: string;
    category?: string;
    seriesOrder?: number;
    description?: string;
    canonicalUrl?: string;
    date?: string;
    silent?: boolean;
  }

  export interface ConvertResult {
    title: string;
    slug: string;
    date: string;
    wordCount: number;
    markdown: string;
  }

  export interface Metadata {
    title: string;
    date: string;
    canonicalUrl: string;
    description: string;
  }

  /**
   * Convert a WordPress HTML file to Markdown
   */
  export function convertFile(
    inputPath: string,
    outputPath: string,
    options?: ConvertOptions
  ): ConvertResult;

  /**
   * Convert HTML string directly to Markdown
   */
  export function convertHtml(
    html: string,
    options?: ConvertOptions
  ): {
    metadata: Metadata & ConvertOptions;
    content: string;
    fullMarkdown: string;
    wordCount: number;
  };

  /**
   * Convert HTML to Markdown
   */
  export function htmlToMarkdown(html: string): string;

  /**
   * Extract article content from WordPress HTML
   */
  export function extractArticleContent(html: string): string;

  /**
   * Extract metadata from WordPress HTML
   */
  export function extractMetadata(html: string): Metadata;

  /**
   * Clean text by removing HTML entities and normalizing whitespace
   */
  export function cleanText(text: string): string;

  /**
   * Generate YAML front matter from metadata
   */
  export function generateFrontMatter(metadata: {
    title?: string;
    slug?: string;
    date?: string;
    canonicalUrl?: string;
    description?: string;
    category?: string;
    seriesOrder?: number;
  }): string;

  // ============================================================================
  // Verify Module
  // ============================================================================

  export interface ValidationResult {
    issues: string[];
    warnings: string[];
  }

  export interface VerificationResult {
    htmlPath: string;
    mdPath: string;
    issues: string[];
    warnings: string[];
    stats: {
      htmlSize: number;
      mdSize: number;
      wordComparison: {
        htmlWords: number;
        mdWords: number;
        diff: number;
        percentDiff: string;
        status: 'OK' | 'WARNING' | 'ERROR';
      };
      htmlUrls: number;
      mdUrls: number;
    };
    checks: Record<string, unknown>;
    passed: boolean;
  }

  /**
   * Verify a conversion from HTML to Markdown
   */
  export function verifyConversion(
    htmlPath: string,
    mdPath: string,
    options?: { strict?: boolean }
  ): VerificationResult;

  /**
   * Verify multiple conversions
   */
  export function verifyBatch(
    htmlDir: string,
    mdDir: string,
    options?: { strict?: boolean }
  ): {
    htmlDir: string;
    mdDir: string;
    files: Array<VerificationResult & { slug: string; htmlFile: string; mdFile: string }>;
    summary: {
      total: number;
      passed: number;
      failed: number;
      warnings: number;
      totalIssues: number;
      totalWarnings: number;
    };
    error?: string;
  };

  /**
   * Validate front matter has required fields
   */
  export function validateFrontMatter(markdown: string): ValidationResult;

  /**
   * Check for malformed markdown structures
   */
  export function validateMarkdownStructure(markdown: string): ValidationResult;

  /**
   * Extract plain text from HTML
   */
  export function extractTextFromHtml(html: string): string;

  /**
   * Extract plain text from Markdown
   */
  export function extractTextFromMarkdown(markdown: string): string;

  /**
   * Extract headings from HTML
   */
  export function extractHeadingsFromHtml(html: string): Array<{ level: number; text: string }>;

  /**
   * Extract headings from Markdown
   */
  export function extractHeadingsFromMarkdown(markdown: string): Array<{ level: number; text: string }>;

  /**
   * Extract URLs from HTML
   */
  export function extractUrlsFromHtml(html: string): Map<string, string>;

  /**
   * Extract URLs from Markdown
   */
  export function extractUrlsFromMarkdown(markdown: string): Map<string, string>;

  // ============================================================================
  // Export Module
  // ============================================================================

  export interface ExportOptions {
    includeWrapper?: boolean;
    rewriteImages?: boolean;
    imageBaseUrl?: string;
    outputToFile?: boolean;
  }

  export interface ExportResult {
    title: string;
    slug: string;
    date: string;
    canonicalUrl: string;
    html: string;
    wordCount: number;
    outputPath?: string;
    metadata?: Record<string, unknown>;
  }

  /**
   * Export a markdown file to WordPress-ready HTML
   */
  export function exportToWordPress(
    mdPath: string,
    outputPath?: string | null,
    options?: ExportOptions
  ): ExportResult;

  /**
   * Export multiple markdown files to WordPress HTML
   */
  export function exportBatch(
    mdDir: string,
    outputDir: string,
    options?: ExportOptions
  ): Array<ExportResult & { success: boolean; error?: string }>;

  /**
   * Convert markdown to HTML
   */
  export function markdownToHtml(markdown: string): string;

  // ============================================================================
  // Config Module
  // ============================================================================

  export interface WordPressSite {
    name: string;
    url: string;
    username: string;
    appPassword: string;
    fromEnv?: boolean;
  }

  /**
   * Get WordPress site configuration
   */
  export function getWordPressSite(siteName?: string): WordPressSite | null;

  /**
   * Add or update a WordPress site configuration
   */
  export function addWordPressSite(
    name: string,
    siteConfig: {
      url: string;
      username: string;
      appPassword: string;
    },
    setAsDefault?: boolean
  ): void;

  /**
   * Remove a WordPress site configuration
   */
  export function removeWordPressSite(name: string): boolean;

  /**
   * List all configured WordPress sites
   */
  export function listWordPressSites(): Array<{
    name: string;
    url: string;
    username: string;
    isDefault: boolean;
  }>;

  /**
   * Get the configuration file path
   */
  export function getConfigPath(): string;

  // ============================================================================
  // WordPress API Client
  // ============================================================================

  export interface WpClientOptions {
    url: string;
    username: string;
    appPassword: string;
  }

  export interface WpPost {
    id: number;
    slug: string;
    link: string;
    status: string;
    title: { rendered: string };
    content: { rendered: string };
  }

  export interface CreatePostData {
    title: string;
    content: string;
    slug?: string;
    status?: 'draft' | 'publish' | 'future' | 'private';
    excerpt?: string;
    categories?: number[];
    tags?: number[];
    date?: string;
  }

  export interface PublishResult {
    action: 'created' | 'updated';
    postId: number;
    slug: string;
    link: string;
    status: string;
  }

  /**
   * WordPress REST API client
   */
  export class WpClient {
    constructor(options: WpClientOptions);

    url: string;
    username: string;
    appPassword: string;
    authHeader: string;

    /**
     * Test the connection to WordPress
     */
    testConnection(): Promise<{
      success: boolean;
      user?: { id: number; name: string; slug: string };
      error?: string;
    }>;

    /**
     * Create a new post
     */
    createPost(postData: CreatePostData): Promise<WpPost>;

    /**
     * Update an existing post
     */
    updatePost(postId: number, postData: Partial<CreatePostData>): Promise<WpPost>;

    /**
     * Get a post by ID
     */
    getPostById(postId: number): Promise<WpPost>;

    /**
     * Get a post by slug
     */
    getPostBySlug(slug: string): Promise<WpPost | null>;

    /**
     * Delete a post
     */
    deletePost(postId: number, force?: boolean): Promise<WpPost>;

    /**
     * Get all categories
     */
    getCategories(): Promise<Array<{ id: number; name: string; slug: string }>>;

    /**
     * Get category ID by name
     */
    getCategoryId(name: string): Promise<number | null>;

    /**
     * Get all tags
     */
    getTags(): Promise<Array<{ id: number; name: string; slug: string }>>;

    /**
     * Get tag ID by name
     */
    getTagId(name: string): Promise<number | null>;

    /**
     * Publish a markdown file to WordPress
     */
    publishMarkdown(
      mdPath: string,
      options?: {
        status?: 'draft' | 'publish';
        update?: boolean;
      }
    ): Promise<PublishResult>;

    /**
     * Sync a markdown file to WordPress (smart create/update)
     */
    syncMarkdown(
      mdPath: string,
      options?: {
        status?: 'draft' | 'publish';
      }
    ): Promise<PublishResult>;
  }

  // ============================================================================
  // Agent API
  // ============================================================================

  export interface Article {
    slug: string;
    path: string;
    title: string;
    date: string;
    wordCount: number;
  }

  export interface FindReplaceOptions {
    pattern: RegExp;
    replacement: string;
    dryRun?: boolean;
    includesFrontMatter?: boolean;
  }

  export interface FindReplaceResult {
    slug: string;
    path: string;
    matchCount: number;
    preview?: string;
  }

  /**
   * Agent API for AI-assisted batch operations
   */
  export class AgentAPI {
    constructor(
      contentDir: string,
      options?: {
        rawDir?: string;
      }
    );

    contentDir: string;
    rawDir?: string;

    /**
     * List all articles in the content directory
     */
    listArticles(): Article[];

    /**
     * Search for content across all articles
     */
    search(query: string | RegExp): Array<{
      slug: string;
      path: string;
      matches: string[];
    }>;

    /**
     * Find and replace across all articles
     */
    findAndReplace(options: FindReplaceOptions): FindReplaceResult[];

    /**
     * Update links across all articles
     */
    updateLinks(options: {
      oldDomain: string;
      newDomain: string;
      dryRun?: boolean;
    }): FindReplaceResult[];

    /**
     * Update front matter across articles
     */
    updateFrontMatter(options: {
      updates: Record<string, unknown>;
      filter?: (article: Article) => boolean;
      dryRun?: boolean;
    }): Array<{ slug: string; path: string; updated: boolean }>;

    /**
     * Validate all articles
     */
    validateAll(): {
      total: number;
      passed: number;
      failed: number;
      results: Array<{
        slug: string;
        path: string;
        passed: boolean;
        issues: string[];
        warnings: string[];
      }>;
    };
  }
}
