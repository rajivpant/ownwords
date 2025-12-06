/**
 * @fileoverview Tests for compare module
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  extractBody,
  extractFrontMatter,
  normalizeForComparison,
  countWords,
  analyzeTypography,
  findFirstDifference,
  compareContent,
  generateReport
} = require('../lib/compare');

describe('extractBody', () => {
  it('extracts body after front matter', () => {
    const content = `---
title: "Test"
date: "2025-01-01"
---

This is the body content.`;

    const body = extractBody(content);
    assert.strictEqual(body, 'This is the body content.');
  });

  it('returns full content if no front matter', () => {
    const content = 'No front matter here.';
    const body = extractBody(content);
    assert.strictEqual(body, 'No front matter here.');
  });

  it('handles multi-line body', () => {
    const content = `---
title: "Test"
---

Line 1.

Line 2.

Line 3.`;

    const body = extractBody(content);
    assert.ok(body.includes('Line 1.'));
    assert.ok(body.includes('Line 2.'));
    assert.ok(body.includes('Line 3.'));
  });
});

describe('extractFrontMatter', () => {
  it('extracts front matter YAML', () => {
    const content = `---
title: "Test Article"
date: "2025-01-01"
---

Body here.`;

    const fm = extractFrontMatter(content);
    assert.ok(fm.includes('title: "Test Article"'));
    assert.ok(fm.includes('date: "2025-01-01"'));
  });

  it('returns empty string if no front matter', () => {
    const content = 'No front matter.';
    const fm = extractFrontMatter(content);
    assert.strictEqual(fm, '');
  });
});

describe('normalizeForComparison', () => {
  it('converts non-breaking spaces to regular spaces', () => {
    const text = 'Hello\u00A0world';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, 'Hello world');
  });

  it('converts curly double quotes to straight quotes', () => {
    const text = '\u201CHello\u201D';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, '"Hello"');
  });

  it('converts curly single quotes to straight quotes', () => {
    const text = 'It\u2019s working';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, "It's working");
  });

  it('converts em dashes to double hyphens', () => {
    const text = 'Hello \u2014 world';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, 'Hello -- world');
  });

  it('converts en dashes to hyphens', () => {
    const text = '2020\u20132025';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, '2020-2025');
  });

  it('converts ellipsis to three dots', () => {
    const text = 'Wait\u2026';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, 'Wait...');
  });

  it('collapses multiple whitespace', () => {
    const text = 'Hello    world\n\n  test';
    const normalized = normalizeForComparison(text);
    assert.strictEqual(normalized, 'Hello world test');
  });
});

describe('countWords', () => {
  it('counts words correctly', () => {
    assert.strictEqual(countWords('Hello world'), 2);
    assert.strictEqual(countWords('One two three four five'), 5);
  });

  it('handles multiple spaces', () => {
    assert.strictEqual(countWords('Hello   world'), 2);
  });

  it('handles empty string', () => {
    assert.strictEqual(countWords(''), 0);
  });

  it('handles newlines', () => {
    assert.strictEqual(countWords('Hello\nworld'), 2);
  });
});

describe('analyzeTypography', () => {
  it('detects curly quote differences', () => {
    const text1 = '"Hello"';  // straight quotes
    const text2 = '\u201CHello\u201D';  // curly quotes

    const result = analyzeTypography(text1, text2);

    assert.ok(result.differences.length > 0);
    const curlyDiff = result.differences.find(d => d.name === 'curlyDoubleQuotes');
    assert.ok(curlyDiff);
    assert.strictEqual(curlyDiff.text1Count, 0);
    assert.strictEqual(curlyDiff.text2Count, 2);
  });

  it('detects non-breaking space differences', () => {
    const text1 = 'Hello world';
    const text2 = 'Hello\u00A0world';

    const result = analyzeTypography(text1, text2);

    const nbspDiff = result.differences.find(d => d.name === 'nonBreakingSpace');
    assert.ok(nbspDiff);
    assert.strictEqual(nbspDiff.text1Count, 0);
    assert.strictEqual(nbspDiff.text2Count, 1);
  });

  it('returns empty differences for identical text', () => {
    const text = 'Hello world';
    const result = analyzeTypography(text, text);
    assert.strictEqual(result.differences.length, 0);
  });
});

describe('findFirstDifference', () => {
  it('returns null for identical strings', () => {
    const result = findFirstDifference('Hello world', 'Hello world');
    assert.strictEqual(result, null);
  });

  it('finds first character difference', () => {
    const result = findFirstDifference('Hello world', 'Hello World');
    assert.ok(result);
    assert.strictEqual(result.position, 6);
    assert.strictEqual(result.char1, 'w');
    assert.strictEqual(result.char2, 'W');
  });

  it('detects length difference', () => {
    const result = findFirstDifference('Hello', 'Hello world');
    assert.ok(result);
    assert.strictEqual(result.lengthDifference, true);
    assert.strictEqual(result.length1, 5);
    assert.strictEqual(result.length2, 11);
  });
});

describe('compareContent', () => {
  it('detects identical content', () => {
    const content = `---
title: "Test"
---

Hello world.`;

    const result = compareContent(content, content);
    assert.strictEqual(result.identical, true);
    assert.strictEqual(result.identicalAfterNormalization, true);
  });

  it('detects typography-only differences', () => {
    const content1 = `---
title: "Test"
---

"Hello" world.`;

    const content2 = `---
title: "Test"
---

\u201CHello\u201D world.`;

    const result = compareContent(content1, content2);
    assert.strictEqual(result.identical, false);
    assert.strictEqual(result.identicalAfterNormalization, true);
  });

  it('detects structural differences', () => {
    const content1 = `---
title: "Test"
---

Hello world.`;

    const content2 = `---
title: "Test"
---

Goodbye world.`;

    const result = compareContent(content1, content2);
    assert.strictEqual(result.identical, false);
    assert.strictEqual(result.identicalAfterNormalization, false);
  });

  it('provides word count stats', () => {
    const content1 = `---
title: "Test"
---

One two three.`;

    const content2 = `---
title: "Test"
---

One two three four five.`;

    const result = compareContent(content1, content2);
    assert.strictEqual(result.stats.content1.wordCount, 3);
    assert.strictEqual(result.stats.content2.wordCount, 5);
  });

  it('detects front matter presence', () => {
    const content1 = `---
title: "Test"
---

Hello.`;

    const content2 = 'Hello.';

    const result = compareContent(content1, content2);
    assert.strictEqual(result.frontMatter.content1Has, true);
    assert.strictEqual(result.frontMatter.content2Has, false);
  });
});

describe('generateReport', () => {
  it('generates report for identical content', () => {
    const comparison = {
      identical: true,
      identicalAfterNormalization: true,
      stats: {
        content1: { wordCount: 10, lineCount: 5 },
        content2: { wordCount: 10, lineCount: 5 }
      },
      typography: { differences: [] },
      firstDifference: null
    };

    const report = generateReport(comparison);
    assert.ok(report.includes('IDENTICAL'));
  });

  it('generates report for typography-only differences', () => {
    const comparison = {
      identical: false,
      identicalAfterNormalization: true,
      stats: {
        content1: { wordCount: 10, lineCount: 5 },
        content2: { wordCount: 10, lineCount: 5 }
      },
      typography: {
        differences: [
          { name: 'curlyDoubleQuotes', description: 'Curly double quotes', text1Count: 0, text2Count: 4 }
        ]
      },
      firstDifference: null
    };

    const report = generateReport(comparison);
    assert.ok(report.includes('typography normalization'));
    assert.ok(report.includes('curlyDoubleQuotes') || report.includes('Curly double quotes'));
  });

  it('generates report for different content', () => {
    const comparison = {
      identical: false,
      identicalAfterNormalization: false,
      stats: {
        content1: { wordCount: 10, lineCount: 5 },
        content2: { wordCount: 15, lineCount: 7 }
      },
      typography: { differences: [] },
      firstDifference: {
        position: 50,
        char1: 'a',
        char2: 'b',
        charCode1: 97,
        charCode2: 98,
        context1: 'context a here',
        context2: 'context b here'
      }
    };

    const report = generateReport(comparison);
    assert.ok(report.includes('DIFFERENT'));
    assert.ok(report.includes('Word difference'));
    assert.ok(report.includes('Position: 50'));
  });
});
