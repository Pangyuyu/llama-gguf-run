const { spawn } = require('child_process');
const chalk = require('chalk');
const { buildLlamaArgs } = require('./builder');
const { createLogSession, createOutputForwarder, formatBytes } = require('./logger');

/** quiet 模式下心跳提示间隔（毫秒） */
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * 结束日志会话：写入结束语、落盘
 * @param {Object|null} logSession - 日志会话
 * @param {number|null} code - 进程退出码
 * @param {Object|null} forwarder - 输出转发器
 */
async function finalizeLog(logSession, code, forwarder = null) {
  // 先把缓冲区里最后一行（可能没有换行符）吐出来
  if (forwarder) forwarder.flush();

  if (!logSession) return;

  const stats = forwarder ? forwarder.getStats() : null;

  logSession.note('----- llama.cpp 输出结束 -----');
  logSession.note(`进程退出码: ${code === null || code === undefined ? 'N/A (被中断或信号终止)' : code}`);
  if (stats) {
    logSession.note(`输出统计: ${stats.totalLines} 行 / ${formatBytes(stats.totalBytes)}；终端回显 ${stats.shownLines} 行 (模式: ${forwarder.level})`);
  }

  try {
    await logSession.close();
    const extra = stats
      ? ` (${stats.totalLines} 行 / ${formatBytes(stats.totalBytes)}` +
        `${forwarder.level !== 'full' ? `，终端仅显示 ${stats.shownLines} 行` : ''})`
      : '';
    console.log(chalk.dim(`\n📄 Log saved: ${logSession.filePath}${extra}`));
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Failed to finalize log file: ${error.message}`));
  }
}

/**
 * quiet 模式下定时打印一行简短心跳，避免长时间运行毫无反馈
 * @param {Object} forwarder - 输出转发器
 * @param {Object|null} logSession - 日志会话
 * @returns {NodeJS.Timeout|null}
 */
function startHeartbeat(forwarder, logSession) {
  if (!forwarder.active || forwarder.level !== 'quiet') return null;

  const timer = setInterval(() => {
    const stats = forwarder.getStats();
    const detail = logSession
      ? `${stats.totalLines} 行已写入日志`
      : `${stats.totalLines} 行输出未回显`;
    console.log(chalk.dim(`🔇 运行中... ${detail}（终端不刷屏，仅显示关键行）`));
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

/**
 * 创建日志会话（失败时降级为不记录日志，不中断启动）
 * @param {Object} config - 配置对象
 * @returns {Object|null} 日志会话
 */
function tryCreateLogSession(config) {
  try {
    return createLogSession({
      logMode: config.logMode,
      logDir: config.logDir,
      modelPath: config.model,
      cwd: config.cwd || process.cwd()
    });
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Failed to create log file: ${error.message} (logging disabled)`));
    return null;
  }
}

/**
 * 执行llama命令
 * @param {Object} config - 配置对象
 * @returns {Promise<void>}
 */
async function runLlama(config) {
  return new Promise(async (resolve, reject) => {
    try {
      const { command, args, gpuInfo } = await buildLlamaArgs(config);
    
    // 构建显示用的命令字符串(正确处理引号)
    const displayArgs = args.map(arg => {
      // 如果参数包含空格、花括号或特殊字符,需要用引号包裹
      if (arg.includes(' ') || arg.includes('{') || arg.includes('}') || arg.includes('"')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
      if (gpuInfo) {
        console.log(chalk.cyan.dim(`[${gpuInfo}]`));
      }
      console.log(chalk.dim(`Executing: ${command} ${displayArgs}\n`));

      // 创建本地日志会话（可选，见 config.logMode / config.logDir）
      const logSession = tryCreateLogSession(config);

      // 输出转发器：日志文件始终写完整内容，终端按 logEcho 决定回显程度
      const forwarder = createOutputForwarder({
        echoLevel: config.logEcho,
        logSession
      });

      if (logSession) {
        logSession.note('===== llama.cpp 日志会话开始 =====');
        logSession.note(`记录模式: ${logSession.mode === 'verbose' ? 'Detailed (附加 -v，完整调试信息)' : 'Standard (标准输出)'}`);
        logSession.note(`终端回显: ${forwarder.level}`);
        logSession.note(`工作目录: ${config.cwd || process.cwd()}`);
        logSession.note(`模型: ${config.model || '(未指定)'}`);
        logSession.note(`原始命令: ${command} ${displayArgs}`);
        logSession.note('----- llama.cpp 输出开始 -----');
        console.log(chalk.dim(`📄 Log file: ${logSession.filePath}`));
      }

      if (forwarder.level === 'quiet') {
        console.log(chalk.dim('🔇 Quiet 终端：完整输出只写入日志文件，终端仅显示错误/警告/启动等关键行'));
      } else if (forwarder.level === 'silent') {
        console.log(chalk.dim(`🔇 Silent 终端：llama.cpp 输出仅写入日志文件${logSession ? '' : '（未开启日志，输出将被丢弃）'}`));
      }
      console.log();

    // 使用spawn启动子进程
    // 注意: 不使用shell: true,直接传递参数数组,避免转义问题
    // 需要记录日志/过滤回显时,用 pipe 接管 stdout/stderr
    const llamaProcess = spawn(command, args, {
      stdio: forwarder.active ? ['inherit', 'pipe', 'pipe'] : 'inherit', // 保持终端可见,同时可落盘
      shell: false // 不使用shell,直接执行
    });

    // 输出分流：一份写日志文件，一份按级别回显终端
    if (forwarder.active) {
      llamaProcess.stdout.on('data', (chunk) => forwarder.stdout(chunk));
      llamaProcess.stderr.on('data', (chunk) => forwarder.stderr(chunk));
    }

    // quiet 模式心跳（提示仍在运行，又不刷屏）
    const heartbeat = startHeartbeat(forwarder, logSession);
    const stopHeartbeat = () => {
      if (heartbeat) clearInterval(heartbeat);
    };

    llamaProcess.on('error', async (error) => {
      stopHeartbeat();
      await finalizeLog(logSession, null, forwarder);
      if (error.code === 'ENOENT') {
        reject(new Error(
          `llama-cli command not found. Please ensure llama is installed and added to PATH.\n` +
          `You can verify by running: llama-cli --version`
        ));
      } else {
        reject(error);
      }
    });

    llamaProcess.on('close', async (code, signal) => {
      stopHeartbeat();
      // 先等待日志落盘完成,再结束本次运行
      await finalizeLog(logSession, code, forwarder);
      if (code === 0) {
        resolve();
      } else if (signal) {
        console.log(chalk.yellow(`\n⚠️  llama process terminated by signal ${signal}`));
        resolve();
      } else {
        console.log(chalk.yellow(`\n⚠️  llama process exited with code ${code}`));
        resolve();
      }
    });
    
      // 处理中断信号
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nStopping llama...'));
        llamaProcess.kill('SIGINT');
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  runLlama
};
