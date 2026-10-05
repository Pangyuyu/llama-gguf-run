const fs = require('fs');
const path = require('path');

/** ANSI 颜色/控制转义序列 */
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * 移除字符串中的 ANSI 颜色控制符（写入日志文件时使用）
 * 终端输出保留颜色，日志文件保持纯净
 * @param {string} text
 * @returns {string}
 */
function stripAnsi(text) {
  if (typeof text !== 'string') return text;
  return text.replace(ANSI_PATTERN, '');
}

function pad(num, width = 2) {
  return String(num).padStart(width, '0');
}

/**
 * 人类可读时间戳：2026-09-19 10:13:45.123
 * @param {Date} [date]
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * 文件名用时间戳：20260919-101345
 * @param {Date} [date]
 * @returns {string}
 */
function formatFileStamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 把模型名清洗成安全的文件名片段
 * @param {string} name
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeName(name, maxLength = 80) {
  const cleaned = String(name || 'model')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (cleaned || 'model').slice(0, maxLength);
}

/**
 * 归一化日志模式
 * @param {'off'|'standard'|'verbose'|boolean|undefined} mode
 * @returns {'off'|'standard'|'verbose'}
 */
function normalizeLogMode(mode) {
  if (mode === true) return 'standard';
  if (mode === false || mode === undefined || mode === null) return 'off';

  const value = String(mode).toLowerCase();
  if (value === 'verbose' || value === 'detailed' || value === 'debug') return 'verbose';
  if (value === 'standard' || value === 'on' || value === 'normal') return 'standard';
  return 'off';
}

/**
 * 是否需要记录日志
 * @param {string} mode
 * @returns {boolean}
 */
function isLogEnabled(mode) {
  return normalizeLogMode(mode) !== 'off';
}

/**
 * 解析日志目录的绝对路径
 * @param {string} [logDir]
 * @param {string} [cwd]
 * @returns {string}
 */
function resolveLogDir(logDir, cwd = process.cwd()) {
  return path.resolve(cwd, logDir || 'logs');
}

/**
 * llama.cpp 日志行的级别前缀，例如：
 *   0.00.123.456 E main: ...
 *   W srv  update_slots: ...
 */
const LEVEL_PREFIX_PATTERN = /^\s*\d*(?:\.\d+)*\s*[EW]\s/;

/** quiet 模式下额外保留的“关键行”关键字（错误/警告/启动等） */
const KEYWORD_PATTERN = /\b(error|failed|failure|fatal|panic|abort|assert|exception|warn|warning|denied|refused|unsupported|unable|out of memory|oom|no space|permission|terminat|listening|starting the main loop|loading model|model loaded)\b/i;

/**
 * 判断一行是否属于“关键行”（quiet 模式下终端仅回显关键行）
 * @param {string} line
 * @returns {boolean}
 */
function isKeyLine(line) {
  return LEVEL_PREFIX_PATTERN.test(line) || KEYWORD_PATTERN.test(line);
}

/**
 * 归一化终端回显级别
 * @param {'full'|'quiet'|'silent'|boolean|undefined} level
 * @returns {'full'|'quiet'|'silent'}
 */
function normalizeEchoLevel(level) {
  if (level === false) return 'silent';
  if (level === undefined || level === null || level === true) return 'full';

  const value = String(level).toLowerCase();
  if (value === 'quiet' || value === 'key' || value === 'keys') return 'quiet';
  if (value === 'silent' || value === 'none' || value === 'mute') return 'silent';
  return 'full';
}

/**
 * 人类可读的字节数
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * 统计字符串中的换行数量（避免 split 产生大量临时对象）
 * @param {string} text
 * @returns {number}
 */
function countNewlines(text) {
  let count = 0;
  let index = text.indexOf('\n');
  while (index !== -1) {
    count++;
    index = text.indexOf('\n', index + 1);
  }
  return count;
}

/**
 * 创建子进程输出转发器
 *
 * 一次读取 llama.cpp 的 stdout/stderr，同时：
 * 1. 完整写入日志文件（始终，含 quiet/silent 模式）
 * 2. 按 echoLevel 决定终端回显：
 *    - full   : 与以往一致，完整回显
 *    - quiet  : 只回显错误/警告/启动等关键行（不刷屏）
 *    - silent : 终端完全不回显
 *
 * @param {Object} options
 * @param {'full'|'quiet'|'silent'} [options.echoLevel]
 * @param {Object|null} [options.logSession] - 日志会话（可为空，此时只做过滤回显）
 * @param {Function} [options.keyPattern] - 关键行判定函数
 * @param {Object} [options.stdout] - 终端输出流
 * @param {Object} [options.stderr] - 终端错误流
 * @returns {Object} {active, level, stdout, stderr, flush, getStats}
 */
function createOutputForwarder({
  echoLevel = 'full',
  logSession = null,
  keyPattern = isKeyLine,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const level = normalizeEchoLevel(echoLevel);
  const active = Boolean(logSession) || level !== 'full';

  const stats = { totalLines: 0, totalBytes: 0, shownLines: 0 };
  const buffers = { out: '', err: '' };

  function show(line, isErr) {
    if (!line) return;
    stats.shownLines++;
    (isErr ? stderr : stdout).write(`${line}\n`);
  }

  function feed(chunk, isErr) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (!text) return;

    // 1. 日志文件始终写入完整输出
    if (logSession) logSession.writeOutput(text);
    stats.totalBytes += Buffer.byteLength(text);

    // 2. 终端回显
    if (level === 'full') {
      stats.totalLines += countNewlines(text);
      (isErr ? stderr : stdout).write(text);
      return;
    }

    // quiet / silent：按行切分统计，quiet 额外回显关键行
    const key = isErr ? 'err' : 'out';
    const lines = (buffers[key] + text).split('\n');
    buffers[key] = lines.pop() ?? '';

    for (const line of lines) {
      stats.totalLines++;
      if (level === 'quiet' && keyPattern(line)) show(line.replace(/\r$/, ''), isErr);
    }
  }

  function flush() {
    if (level === 'full') return;

    for (const isErr of [false, true]) {
      const key = isErr ? 'err' : 'out';
      const rest = buffers[key];
      buffers[key] = '';
      if (!rest) continue;

      stats.totalLines++;
      if (level === 'quiet' && keyPattern(rest)) show(rest.replace(/\r$/, ''), isErr);
    }
  }

  return {
    active,
    level,
    stdout: (chunk) => feed(chunk, false),
    stderr: (chunk) => feed(chunk, true),
    flush,
    getStats: () => ({ ...stats })
  };
}

/**
 * 创建本地日志会话
 *
 * 负责：
 * - 创建日志目录（递归）
 * - 生成带时间戳的日志文件名
 * - 提供带时间戳的 note() 与原始输出 writeOutput()
 *
 * @param {Object} options
 * @param {'off'|'standard'|'verbose'} [options.logMode]
 * @param {string} [options.logDir] - 日志目录（默认 logs）
 * @param {string} [options.modelPath] - 模型路径（用于生成文件名）
 * @param {string} [options.cwd] - 工作目录基准
 * @returns {Object|null} 日志会话对象；未启用时返回 null
 */
function createLogSession({ logMode = 'off', logDir = 'logs', modelPath = '', cwd = process.cwd() } = {}) {
  const mode = normalizeLogMode(logMode);
  if (mode === 'off') return null;

  const dir = resolveLogDir(logDir, cwd);
  fs.mkdirSync(dir, { recursive: true });

  const modelName = sanitizeName(path.basename(modelPath || 'model').replace(/\.gguf$/i, ''));
  const filePath = path.join(dir, `llama-${formatFileStamp()}-${modelName}.log`);
  const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });

  return {
    filePath,
    dir,
    mode,

    /**
     * 写入一行带时间戳的说明信息
     * @param {string} [text]
     */
    note(text = '') {
      stream.write(`[${formatTimestamp()}] ${text}\n`);
    },

    /**
     * 写入 llama.cpp 的原始输出（自动去除 ANSI 颜色）
     * @param {Buffer|string} chunk
     */
    writeOutput(chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      stream.write(stripAnsi(text));
    },

    /**
     * 结束日志写入（等待落盘完成）
     * @returns {Promise<string>} 日志文件绝对路径
     */
    close() {
      return new Promise((resolve) => {
        stream.end(() => resolve(filePath));
      });
    }
  };
}

module.exports = {
  stripAnsi,
  formatTimestamp,
  formatFileStamp,
  sanitizeName,
  normalizeLogMode,
  isLogEnabled,
  resolveLogDir,
  createLogSession,
  isKeyLine,
  normalizeEchoLevel,
  formatBytes,
  createOutputForwarder
};
