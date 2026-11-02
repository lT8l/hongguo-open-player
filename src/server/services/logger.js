// SPDX-License-Identifier: GPL-3.0-only
const fs = require('node:fs');
const path = require('node:path');

class Logger {
  constructor({ logDir, maxSizeBytes = 5 * 1024 * 1024, maxBackups = 3 } = {}) {
    this.maxSizeBytes = maxSizeBytes;
    this.maxBackups = maxBackups;
    this.logDir = logDir || process.env.HONGGUO_LOG_DIR || this._resolveDefaultLogDir();
    this.logFile = path.join(this.logDir, 'app.log');
    this._initialized = false;
  }

  _resolveDefaultLogDir() {
    const dataDir = process.env.HONGGUO_DATA_DIR || path.join(__dirname, '../../../data');
    return path.join(path.dirname(dataDir), 'logs');
  }

  _ensureDir() {
    if (this._initialized) return;
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      this._initialized = true;
    } catch (_) {}
  }

  _rotateIfNeeded() {
    try {
      if (!fs.existsSync(this.logFile)) return;
      const stat = fs.statSync(this.logFile);
      if (stat.size < this.maxSizeBytes) return;

      // 滚动日志：app.2.log -> app.3.log, app.1.log -> app.2.log, app.log -> app.1.log
      for (let i = this.maxBackups - 1; i >= 1; i--) {
        const src = path.join(this.logDir, `app.${i}.log`);
        const dst = path.join(this.logDir, `app.${i + 1}.log`);
        if (fs.existsSync(src)) {
          try { fs.renameSync(src, dst); } catch (_) {}
        }
      }
      const firstBackup = path.join(this.logDir, 'app.1.log');
      fs.renameSync(this.logFile, firstBackup);
    } catch (_) {}
  }

  _format(level, tag, message, extra) {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
               `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
    const prefix = tag ? `[${tag}] ` : '';
    let extraStr = '';
    if (extra !== undefined) {
      if (extra instanceof Error) {
        extraStr = `\n${extra.stack || extra.message}`;
      } else if (typeof extra === 'object') {
        try { extraStr = ' ' + JSON.stringify(extra); } catch (_) { extraStr = ' [Object]'; }
      } else {
        extraStr = ' ' + String(extra);
      }
    }
    return `[${ts}] [${level}] ${prefix}${message}${extraStr}\n`;
  }

  log(level, tag, message, extra) {
    const line = this._format(level, tag, message, extra);
    // 1. 标准输出（开发环境/命令行可见）
    if (level === 'ERROR') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }

    // 2. 本地日志文件持久化（排错与收集）
    try {
      this._ensureDir();
      this._rotateIfNeeded();
      fs.appendFileSync(this.logFile, line, 'utf8');
    } catch (_) {}
  }

  debug(tag, message, extra) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      this.log('DEBUG', tag, message, extra);
    }
  }

  info(tag, message, extra) {
    this.log('INFO', tag, message, extra);
  }

  warn(tag, message, extra) {
    this.log('WARN', tag, message, extra);
  }

  error(tag, message, extra) {
    this.log('ERROR', tag, message, extra);
  }

  getLogFilePath() {
    return this.logFile;
  }

  getLogDir() {
    return this.logDir;
  }

  /**
   * 读取最近 N 行日志供故障排查或前端诊断展示
   */
  getRecentLogs(limit = 100) {
    try {
      if (!fs.existsSync(this.logFile)) return [];
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      return lines.slice(-limit);
    } catch (_) {
      return [];
    }
  }
}

const defaultLogger = new Logger();

module.exports = defaultLogger;
module.exports.Logger = Logger;
