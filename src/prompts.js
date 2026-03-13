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
        if (!currentModel) {
          // 没有模型时，返回简单列表
          return ['None', ...mmprojFiles];
        }

        // 进行自动匹配
        const matched = matchMmprojToFile(currentModel, [...mmprojFiles]);
        const choices = [];

        if (matched) {
          // 自动匹配的排在第一个
          choices.push({
            name: `${matched} ⭐ (auto-matched)`,
            value: matched
          });
          // 添加 "None" 选项
          choices.push({
            name: 'None',
            value: 'None'
          });
          // 添加其他 mmproj 文件（排除已匹配的）
          mmprojFiles.forEach(file => {
            if (file !== matched) {
              choices.push(file);
            }
          });
        } else {
          // 没有匹配时，返回简单列表
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
  buildPromptQuestions
};
