const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

/**
 * 扫描目录下的所有.mmproj 文件
 * @param {string} dirPath - 目录路径
 * @returns {string[]} mmproj 文件列表
 */
function scanMmprojFiles(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    const mmprojFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.gguf' && file.toLowerCase().includes('mmproj');
    });
    mmprojFiles.sort();
    return mmprojFiles;
  } catch (error) {
    return [];
  }
}

/**
 * 构建交互式提示问题列表
 * @param {Object} options - 命令行参数选项
 * @param {string[]} ggufFiles - 可用的 GGUF 文件列表
 * @param {string} modelsDir - models 目录路径
 * @returns {Array} Inquirer 问题数组
 */
function buildPromptQuestions(options, ggufFiles, modelsDir) {
  const questions = [];

  // 模型选择 (如果命令行未指定)
  if (!options.model) {
    questions.push({
      type: 'list',
      name: 'model',
      message: 'Select a GGUF model:',
      choices: ggufFiles,
      pageSize: 10
    });
  }

  // 多模态投影文件选择 (可选)
  const mmprojFiles = scanMmprojFiles(modelsDir);
  
  if (mmprojFiles.length > 0) {
    questions.push({
      type: 'list',
      name: 'mmproj',
      message: 'Select a multimodal projection file (optional):',
      choices: ['None', ...mmprojFiles],
      default: 'None',
      suffix: chalk.dim(' (for image/video analysis)')
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
    suffix: chalk.dim(' (e.g., --n-gpu-layers 35 --threads 4)\n    \x1b[90mFor image support with Cherry Studio: --cache-type-k q8_0 --no-mmap\x1b[0m')
  });

  // llama 命令名称
  questions.push({
    type: 'input',
    name: 'llamaCommand',
    message: 'Llama command name:',
    default: options.llamaCommand || 'llama-server',
    suffix: chalk.dim(' (llama-server, llama-cli, llama-mtmd-cli, etc.)\n    \x1b[33mNote: For image analysis with Cherry Studio, use llama-mtmd-cli or llama-server with --mmproj\x1b[0m')
  });

  return questions;
}

module.exports = {
  buildPromptQuestions,
  scanMmprojFiles
};
