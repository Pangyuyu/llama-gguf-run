const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { getMmprojOptions, matchMmprojToFile } = require('./mmproj-matcher');

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

  // 多模态投影文件选择 (可选) - 扫描 mmprojs 目录，支持自动匹配
  const mmprojsDir = path.join(path.dirname(modelsDir), 'mmprojs');
  const { files: mmprojFiles } = getMmprojOptions(mmprojsDir, modelsDir, null);

  if (mmprojFiles.length > 0) {
    questions.push({
      type: 'list',
      name: 'mmproj',
      message: 'Select a multimodal projection file (optional):',
      choices: (answers) => {
        // 确定当前选择的模型（命令行指定或交互式选择）
        const currentModel = options.model || answers.model;
        const choices = [];

        if (currentModel) {
          // 进行自动匹配
          const matched = matchMmprojToFile(currentModel, [...mmprojFiles]);

          if (matched) {
            // 只显示匹配的选项和 None（其他 mmproj 文件不兼容，不显示）
            choices.push({
              name: `${matched} ⭐ (auto-matched)`,
              value: matched
            });
            choices.push({
              name: 'None',
              value: 'None'
            });
          } else {
            // 没有匹配时，显示所有 mmproj 文件（让用户手动尝试）
            choices.push('None', ...mmprojFiles);
          }
        } else {
          // 没有模型时，返回简单列表
          choices.push('None', ...mmprojFiles);
        }

        return choices;
      },
      default: (answers) => {
        // 确定当前选择的模型
        const currentModel = options.model || answers.model;
        if (!currentModel) {
          return 'None';
        }

        // 进行自动匹配并返回匹配结果作为默认值
        const matched = matchMmprojToFile(currentModel, [...mmprojFiles]);
        return matched || 'None';
      },
      suffix: chalk.dim(' (for image/video analysis)')
    });
  }

  // Context Size
  questions.push({
    type: 'input',
    name: 'ctxSize',
    message: 'Context size:',
    default: options.ctxSize || '16384',  // 默认 16384，确保多模态图片解析有足够上下文
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
    type: 'list',
    name: 'host',
    message: 'Server host:',
    choices: [
      { name: '127.0.0.1 (localhost only)', value: '127.0.0.1' },
      { name: '0.0.0.0 (allow external connections)', value: '0.0.0.0' }
    ],
    default: options.host ? (options.host === '0.0.0.0' ? 1 : 0) : 0
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

  // Temperature
  questions.push({
    type: 'input',
    name: 'temp',
    message: 'Temperature:',
    default: options.temp || '1.0',
    validate: (input) => {
      const num = parseFloat(input);
      if (isNaN(num) || num < 0) {
        return 'Please enter a valid non-negative number';
      }
      return true;
    }
  });

  // Top-P
  questions.push({
    type: 'input',
    name: 'topP',
    message: 'Top-P sampling:',
    default: options.topP || '0.95',
    validate: (input) => {
      const num = parseFloat(input);
      if (isNaN(num) || num < 0 || num > 1) {
        return 'Please enter a valid number between 0 and 1';
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

  // 思考模式 (enable_thinking)
  questions.push({
    type: 'confirm',
    name: 'enableThinking',
    message: 'Enable thinking mode:',
    default: options.enableThinking !== undefined ? options.enableThinking : true,
    suffix: chalk.dim(' (allows the model to think before responding)')
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
  buildPromptQuestions
};
