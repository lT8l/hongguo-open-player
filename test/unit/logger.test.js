// SPDX-License-Identifier: GPL-3.0-only
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Logger } = require('../../src/server/services/logger');

test('logger formats, appends, rotates, and reads recent logs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongguo-log-test-'));
  try {
    const logger = new Logger({ logDir: tempDir, maxSizeBytes: 200, maxBackups: 2 });
    assert.equal(logger.getLogDir(), tempDir);
    assert.equal(logger.getLogFilePath(), path.join(tempDir, 'app.log'));

    // 1. Basic logging
    logger.info('TestTag', 'Hello world');
    logger.warn('TestTag', 'Warning event');
    logger.error('TestTag', 'Error occurred', new Error('sample error'));

    const logFile = logger.getLogFilePath();
    assert.ok(fs.existsSync(logFile));
    const content = fs.readFileSync(logFile, 'utf8');
    assert.match(content, /\[INFO\] \[TestTag\] Hello world/);
    assert.match(content, /\[WARN\] \[TestTag\] Warning event/);
    assert.match(content, /\[ERROR\] \[TestTag\] Error occurred/);

    // 2. Read recent logs
    const recent = logger.getRecentLogs(2);
    assert.equal(recent.length, 2);

    // 3. Rotation when size exceeds 200 bytes
    for (let i = 0; i < 15; i++) {
      logger.info('Stress', `Long message line ${i} ` + 'A'.repeat(50));
    }
    // Should have created app.1.log
    assert.ok(fs.existsSync(path.join(tempDir, 'app.1.log')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
