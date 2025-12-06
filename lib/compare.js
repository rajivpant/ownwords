/**
 * @fileoverview Content comparison utilities for ownwords
 * @module ownwords/compare
 *
 * Utilities for comparing markdown files, detecting content drift,
 * and analyzing differences between local and remote versions.
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract the body content from a markdown file (after front matter)
 *
 * @param {string} content - Full markdown content including front matter
 * @returns {string} Body content without front matter
 */
function extractBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

/**
 * Extract front matter from markdown content
 *
 * @param {string} content - Full markdown content
 * @returns {string} Front matter YAML without delimiters
 */
function extractFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

/**
 * Normalize text for comparison by standardizing typography
 *
 * Converts curly quotes to straight, non-breaking spaces to regular,
 * and normalizes whitespace.
 *
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeForComparison(text) {
  return text
    .replace(/\u00A0/g, ' ')           // Non-breaking space -> regular space
    .replace(/[\u201C\u201D]/g, '"')   // Curly double quotes -> straight
    .replace(/[\u2018\u2019]/g, "'")   // Curly single quotes -> straight
    .replace(/\u2014/g, '--')          // Em dash -> double hyphen
    .replace(/\u2013/g, '-')           // En dash -> hyphen
    .replace(/\u2026/g, '...')         // Ellipsis -> three dots
    .replace(/\s+/g, ' ')              // Collapse whitespace
    .trim();
}

/**
 * Count words in text
 *
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Analyze typography differences between two texts
 *
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {Object} Typography analysis
 */
function analyzeTypography(text1, text2) {
  const checks = [
    { name: 'emDash', regex: /\u2014/g, description: 'Em dash' },
    { name: 'enDash', regex: /\u2013/g, description: 'En dash' },
    { name: 'curlyDoubleQuotes', regex: /[\u201C\u201D]/g, description: 'Curly double quotes' },
    { name: 'curlySingleQuotes', regex: /[\u2018\u2019]/g, description: 'Curly single quotes' },
    { name: 'straightDoubleQuotes', regex: /"/g, description: 'Straight double quotes' },
    { name: 'straightSingleQuotes', regex: /'/g, description: 'Straight single quotes' },
    { name: 'nonBreakingSpace', regex: /\u00A0/g, description: 'Non-breaking space' },
    { name: 'ellipsis', regex: /\u2026/g, description: 'Ellipsis' }
  ];

  const result = {
    differences: [],
    text1Stats: {},
    text2Stats: {}
  };

  for (const check of checks) {
    const count1 = (text1.match(check.regex) || []).length;
    const count2 = (text2.match(check.regex) || []).length;

    result.text1Stats[check.name] = count1;
    result.text2Stats[check.name] = count2;

    if (count1 !== count2) {
      result.differences.push({
        name: check.name,
        description: check.description,
        text1Count: count1,
        text2Count: count2,
        diff: count2 - count1
      });
    }
  }

  return result;
}

/**
 * Find the first character-level difference between two strings
 *
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {Object|null} Difference info or null if identical
 */
function findFirstDifference(s1, s2) {
  const minLen = Math.min(s1.length, s2.length);

  for (let i = 0; i < minLen; i++) {
    if (s1[i] !== s2[i]) {
      return {
        position: i,
        char1: s1[i],
        char2: s2[i],
        charCode1: s1.charCodeAt(i),
        charCode2: s2.charCodeAt(i),
        context1: s1.substring(Math.max(0, i - 20), i + 30),
        context2: s2.substring(Math.max(0, i - 20), i + 30)
      };
    }
  }

  if (s1.length !== s2.length) {
    return {
      position: minLen,
      lengthDifference: true,
      length1: s1.length,
      length2: s2.length
    };
  }

  return null;
}

/**
 * Compare two markdown files
 *
 * @param {string} path1 - Path to first file
 * @param {string} path2 - Path to second file
 * @param {Object} [options] - Comparison options
 * @param {boolean} [options.normalizeTypography=false] - Normalize quotes/spaces before comparing
 * @returns {Object} Comparison result
 */
function compareFiles(path1, path2, options = {}) {
  const content1 = fs.readFileSync(path1, 'utf8');
  const content2 = fs.readFileSync(path2, 'utf8');

  return compareContent(content1, content2, options);
}

/**
 * Compare two markdown content strings
 *
 * @param {string} content1 - First markdown content
 * @param {string} content2 - Second markdown content
 * @param {Object} [options] - Comparison options
 * @param {boolean} [options.normalizeTypography=false] - Normalize quotes/spaces before comparing
 * @returns {Object} Comparison result
 */
function compareContent(content1, content2, options = {}) {
  const body1 = extractBody(content1);
  const body2 = extractBody(content2);

  const frontMatter1 = extractFrontMatter(content1);
  const frontMatter2 = extractFrontMatter(content2);

  // Analyze typography
  const typography = analyzeTypography(body1, body2);

  // Compare with optional normalization
  let compareBody1 = body1;
  let compareBody2 = body2;

  if (options.normalizeTypography) {
    compareBody1 = normalizeForComparison(body1);
    compareBody2 = normalizeForComparison(body2);
  }

  const isIdentical = compareBody1 === compareBody2;
  const firstDiff = isIdentical ? null : findFirstDifference(compareBody1, compareBody2);

  return {
    identical: isIdentical,
    identicalAfterNormalization: normalizeForComparison(body1) === normalizeForComparison(body2),

    stats: {
      content1: {
        totalLength: content1.length,
        bodyLength: body1.length,
        wordCount: countWords(body1),
        lineCount: body1.split('\n').length
      },
      content2: {
        totalLength: content2.length,
        bodyLength: body2.length,
        wordCount: countWords(body2),
        lineCount: body2.split('\n').length
      }
    },

    typography,
    firstDifference: firstDiff,

    frontMatter: {
      content1Has: frontMatter1.length > 0,
      content2Has: frontMatter2.length > 0
    }
  };
}

/**
 * Compare multiple file pairs
 *
 * @param {Array<{file1: string, file2: string, name?: string}>} pairs - File pairs to compare
 * @param {Object} [options] - Comparison options
 * @returns {Object} Batch comparison results
 */
function compareBatch(pairs, options = {}) {
  const results = [];
  let identicalCount = 0;
  let identicalAfterNormCount = 0;

  for (const pair of pairs) {
    try {
      const result = compareFiles(pair.file1, pair.file2, options);
      results.push({
        name: pair.name || path.basename(pair.file1),
        file1: pair.file1,
        file2: pair.file2,
        ...result,
        error: null
      });

      if (result.identical) identicalCount++;
      if (result.identicalAfterNormalization) identicalAfterNormCount++;
    } catch (error) {
      results.push({
        name: pair.name || path.basename(pair.file1),
        file1: pair.file1,
        file2: pair.file2,
        identical: false,
        error: error.message
      });
    }
  }

  return {
    total: pairs.length,
    identical: identicalCount,
    identicalAfterNormalization: identicalAfterNormCount,
    different: pairs.length - identicalAfterNormCount,
    results
  };
}

/**
 * Generate a human-readable comparison report
 *
 * @param {Object} comparison - Comparison result from compareContent or compareFiles
 * @param {Object} [options] - Report options
 * @param {boolean} [options.verbose=false] - Include detailed typography analysis
 * @returns {string} Formatted report
 */
function generateReport(comparison, options = {}) {
  const lines = [];

  // Status
  if (comparison.identical) {
    lines.push('Status: IDENTICAL');
  } else if (comparison.identicalAfterNormalization) {
    lines.push('Status: IDENTICAL (after typography normalization)');
    lines.push('  Typography differences only (quotes, spaces, dashes)');
  } else {
    lines.push('Status: DIFFERENT');
  }

  // Stats
  lines.push('');
  lines.push('Statistics:');
  lines.push(`  File 1: ${comparison.stats.content1.wordCount} words, ${comparison.stats.content1.lineCount} lines`);
  lines.push(`  File 2: ${comparison.stats.content2.wordCount} words, ${comparison.stats.content2.lineCount} lines`);

  const wordDiff = comparison.stats.content2.wordCount - comparison.stats.content1.wordCount;
  if (wordDiff !== 0) {
    lines.push(`  Word difference: ${wordDiff > 0 ? '+' : ''}${wordDiff}`);
  }

  // Typography differences
  if (comparison.typography.differences.length > 0) {
    lines.push('');
    lines.push('Typography differences:');
    for (const diff of comparison.typography.differences) {
      lines.push(`  ${diff.description}: ${diff.text1Count} vs ${diff.text2Count}`);
    }
  }

  // First structural difference
  if (comparison.firstDifference && !comparison.identicalAfterNormalization) {
    lines.push('');
    lines.push('First content difference:');
    if (comparison.firstDifference.lengthDifference) {
      lines.push(`  Length difference at position ${comparison.firstDifference.position}`);
      lines.push(`  File 1: ${comparison.firstDifference.length1} chars`);
      lines.push(`  File 2: ${comparison.firstDifference.length2} chars`);
    } else {
      lines.push(`  Position: ${comparison.firstDifference.position}`);
      lines.push(`  File 1 char: "${comparison.firstDifference.char1}" (code ${comparison.firstDifference.charCode1})`);
      lines.push(`  File 2 char: "${comparison.firstDifference.char2}" (code ${comparison.firstDifference.charCode2})`);
      if (options.verbose) {
        lines.push(`  Context 1: "...${comparison.firstDifference.context1.replace(/\n/g, '\\n')}..."`);
        lines.push(`  Context 2: "...${comparison.firstDifference.context2.replace(/\n/g, '\\n')}..."`);
      }
    }
  }

  return lines.join('\n');
}

module.exports = {
  extractBody,
  extractFrontMatter,
  normalizeForComparison,
  countWords,
  analyzeTypography,
  findFirstDifference,
  compareFiles,
  compareContent,
  compareBatch,
  generateReport
};
