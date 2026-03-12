/**
 * 构建交互式提示问题列表
 * @param {Object} options - 命令行参数选项
 * @param {string[]} ggufFiles - 可用的GGUF文件列表
 * @returns {Array} Inquirer问题数组
 */
function buildPromptQuestions(options, ggufFiles) {
  const questions = [];

  // 模型选择(如果命令行未指定)
  if (!options.model) {
    questions.push({
      type: 'list',
      name: 'model',
      message: 'Select a GGUF model:',
      choices: ggufFiles,
      pageSize: 10
    });
  }

  // Context Size
  questions.push({
    type: 'input',
    name: 'ctxSize',
    message: 'Context size:',
    default: options.ctxSize || '2048',
    validate: (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num <= 0) {
        return 'Please enter a valid positive number';
      }
      return true;
    }
  });

  // Host
  questions.push({
    type: 'input',
    name: 'host',
    message: 'Server host:',
    default: options.host || '127.0.0.1',
    validate: (input) => {
      if (!input || input.trim() === '') {
        return 'Host cannot be empty';
      }
      return true;
    }
  });

  // Port
  questions.push({
    type: 'input',
    name: 'port',
    message: 'Server port:',
    default: options.port || '8080',
    validate: (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 1 || num > 65535) {
        return 'Please enter a valid port number (1-65535)';
      }
      return true;
    }
  });

  // 额外参数
  questions.push({
    type: 'input',
    name: 'extraArgs',
    message: 'Additional llama arguments (optional):',
    default: options.extraArgs || '',
    suffix: chalk.dim(' (e.g., --n-gpu-layers 35 --threads 4)')
  });

  // llama命令名称
  questions.push({
    type: 'input',
    name: 'llamaCommand',
    message: 'Llama command name:',
    default: options.llamaCommand || 'llama-server',
    suffix: chalk.dim(' (llama-server, llama-cli, etc.)')
  });

  return questions;
}

const chalk = require('chalk');

module.exports = {
  buildPromptQuestions
};
