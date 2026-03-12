const { spawn } = require('child_process');
const chalk = require('chalk');
const { buildLlamaArgs } = require('./builder');

/**
 * 执行llama命令
 * @param {Object} config - 配置对象
 * @returns {Promise<void>}
 */
function runLlama(config) {
  return new Promise((resolve, reject) => {
    const { command, args } = buildLlamaArgs(config);
    
    // 构建显示用的命令字符串(正确处理引号)
    const displayArgs = args.map(arg => {
      // 如果参数包含空格、花括号或特殊字符,需要用引号包裹
      if (arg.includes(' ') || arg.includes('{') || arg.includes('}') || arg.includes('"')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
    
    console.log(chalk.dim(`Executing: ${command} ${displayArgs}\n`));
    
    // 使用spawn启动子进程
    // 注意: 不使用shell: true,直接传递参数数组,避免转义问题
    const llamaProcess = spawn(command, args, {
      stdio: 'inherit', // 继承标准输入输出
      shell: false // 不使用shell,直接执行
    });
    
    llamaProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(
          `llama-cli command not found. Please ensure llama is installed and added to PATH.\n` +
          `You can verify by running: llama-cli --version`
        ));
      } else {
        reject(error);
      }
    });
    
    llamaProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else if (code !== null) {
        console.log(chalk.yellow(`\n⚠️  llama process exited with code ${code}`));
        resolve();
      }
    });
    
    // 处理中断信号
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nStopping llama...'));
      llamaProcess.kill('SIGINT');
    });
  });
}

module.exports = {
  runLlama
};
