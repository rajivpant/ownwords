/**
 * @fileoverview Configuration management for ownwords
 * @module ownwords/config
 *
 * Handles reading/writing configuration from XDG-compliant location:
 *   ~/.config/ownwords/config.json (or $XDG_CONFIG_HOME/ownwords/config.json)
 *
 * Supports environment variable overrides for CI/CD environments.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * XDG-compliant configuration directory
 * Uses $XDG_CONFIG_HOME if set, otherwise ~/.config
 * @constant {string}
 */
const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const CONFIG_DIR = path.join(XDG_CONFIG_HOME, 'ownwords');

/**
 * Default configuration file path
 * @constant {string}
 */
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Environment variable names for overrides
 * @constant {Object}
 */
const ENV_VARS = {
  WP_PASSWORD: 'OWNWORDS_WP_PASSWORD',
  WP_USERNAME: 'OWNWORDS_WP_USERNAME',
  WP_SITE: 'OWNWORDS_WP_SITE'
};

/**
 * Default configuration structure
 * @constant {Object}
 */
const DEFAULT_CONFIG = {
  wordpress: {
    sites: {},
    defaultSite: null
  }
};

/**
 * Ensure the config directory exists with proper permissions
 *
 * @returns {void}
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Check if config file has secure permissions (600 on Unix)
 *
 * @returns {{secure: boolean, message: string}} Security check result
 */
function checkConfigPermissions() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { secure: true, message: 'Config file does not exist yet' };
  }

  // On Windows, file permissions work differently
  if (process.platform === 'win32') {
    return { secure: true, message: 'Windows - permissions not checked' };
  }

  try {
    const stats = fs.statSync(CONFIG_FILE);
    const mode = stats.mode & 0o777;

    // Check for 600 (owner read/write only)
    if (mode === 0o600) {
      return { secure: true, message: 'Permissions are secure (600)' };
    }

    return {
      secure: false,
      message: `Config file has insecure permissions (${mode.toString(8)}). Run: chmod 600 ${CONFIG_FILE}`
    };
  } catch (error) {
    return { secure: false, message: `Could not check permissions: ${error.message}` };
  }
}

/**
 * Read the configuration file
 *
 * @returns {Object} Configuration object
 */
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);

    // Merge with defaults to ensure all keys exist
    return {
      ...DEFAULT_CONFIG,
      ...config,
      wordpress: {
        ...DEFAULT_CONFIG.wordpress,
        ...config.wordpress
      }
    };
  } catch (error) {
    throw new Error(`Failed to read config: ${error.message}`);
  }
}

/**
 * Write the configuration file with secure permissions
 *
 * @param {Object} config - Configuration object to write
 * @returns {void}
 */
function writeConfig(config) {
  ensureConfigDir();

  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_FILE, content, { mode: 0o600 });
}

/**
 * Get WordPress site configuration
 *
 * Resolves credentials in this order:
 * 1. Environment variables
 * 2. Config file
 *
 * @param {string} [siteName] - Site name (uses default if not specified)
 * @returns {Object|null} Site configuration or null if not found
 */
function getWordPressSite(siteName) {
  const config = readConfig();

  // Check environment variables first
  const envSite = process.env[ENV_VARS.WP_SITE];
  const envUsername = process.env[ENV_VARS.WP_USERNAME];
  const envPassword = process.env[ENV_VARS.WP_PASSWORD];

  // If all env vars are set, use them
  if (envSite && envUsername && envPassword) {
    return {
      name: 'env',
      url: envSite,
      username: envUsername,
      appPassword: envPassword,
      fromEnv: true
    };
  }

  // Otherwise, look up in config
  const name = siteName || config.wordpress.defaultSite;

  if (!name) {
    return null;
  }

  const site = config.wordpress.sites[name];

  if (!site) {
    return null;
  }

  // Allow env var to override just the password
  return {
    name,
    url: site.url,
    username: site.username,
    appPassword: envPassword || site.appPassword,
    fromEnv: !!envPassword
  };
}

/**
 * Add or update a WordPress site configuration
 *
 * @param {string} name - Site identifier (e.g., "myblog")
 * @param {Object} siteConfig - Site configuration
 * @param {string} siteConfig.url - WordPress site URL
 * @param {string} siteConfig.username - WordPress username
 * @param {string} siteConfig.appPassword - WordPress application password
 * @param {boolean} [setAsDefault=false] - Set as default site
 * @returns {void}
 */
function addWordPressSite(name, siteConfig, setAsDefault = false) {
  const config = readConfig();

  config.wordpress.sites[name] = {
    url: siteConfig.url.replace(/\/$/, ''), // Remove trailing slash
    username: siteConfig.username,
    appPassword: siteConfig.appPassword
  };

  if (setAsDefault || !config.wordpress.defaultSite) {
    config.wordpress.defaultSite = name;
  }

  writeConfig(config);
}

/**
 * Remove a WordPress site configuration
 *
 * @param {string} name - Site identifier to remove
 * @returns {boolean} True if site was removed, false if not found
 */
function removeWordPressSite(name) {
  const config = readConfig();

  if (!config.wordpress.sites[name]) {
    return false;
  }

  delete config.wordpress.sites[name];

  // Clear default if it was this site
  if (config.wordpress.defaultSite === name) {
    const remaining = Object.keys(config.wordpress.sites);
    config.wordpress.defaultSite = remaining.length > 0 ? remaining[0] : null;
  }

  writeConfig(config);
  return true;
}

/**
 * List all configured WordPress sites
 *
 * @returns {Array<{name: string, url: string, username: string, isDefault: boolean}>}
 */
function listWordPressSites() {
  const config = readConfig();
  const sites = [];

  for (const [name, site] of Object.entries(config.wordpress.sites)) {
    sites.push({
      name,
      url: site.url,
      username: site.username,
      isDefault: name === config.wordpress.defaultSite
    });
  }

  return sites;
}

/**
 * Set the default WordPress site
 *
 * @param {string} name - Site name to set as default
 * @returns {boolean} True if successful, false if site not found
 */
function setDefaultWordPressSite(name) {
  const config = readConfig();

  if (!config.wordpress.sites[name]) {
    return false;
  }

  config.wordpress.defaultSite = name;
  writeConfig(config);
  return true;
}

/**
 * Get the configuration file path
 *
 * @returns {string} Path to config file
 */
function getConfigPath() {
  return CONFIG_FILE;
}

module.exports = {
  // Core functions
  readConfig,
  writeConfig,
  ensureConfigDir,
  checkConfigPermissions,
  getConfigPath,

  // WordPress site management
  getWordPressSite,
  addWordPressSite,
  removeWordPressSite,
  listWordPressSites,
  setDefaultWordPressSite,

  // Constants
  ENV_VARS,
  CONFIG_DIR,
  CONFIG_FILE
};
