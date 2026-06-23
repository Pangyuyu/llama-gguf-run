const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { getMmprojOptions, matchMmprojToFile, getPackageMmprojFiles, isPackageModel } = require('./mmproj-matcher');
const { calculateRecommendedLayers, getGPULayersModeOptions } = require('./gpu-estimator');

/**
 * 构建交互式提示问题列表
 * @param {Object} options - 命令行参数选项
 * @param {Array} modelEntries - 模型条目数组（来自 scanModels）
 * @param {string} modelsDir - models 目录路径
 * @returns {Array} Inquirer 问题数组
 */
function buildPromptQuestions(options, modelEntries, modelsDir) {
  const questions = [];

  // 模型选择 (如果命令行未指定)
  if (!options.model) {
    questions.push({
      type: 'list',
      name: 'model',
      message: 'Select a GGUF model:',
      choices: modelEntries.map(m => ({
        name: m.displayName,
        value: m.modelPath    // 使用绝对路径作为值
      })),
      pageSize: 10,
      suffix: chalk.dim(` (${modelEntries.length} models available)`)
    });
  }

  // 全局 mmprojs 目录（平铺模型备选）
  const mmprojsDir = path.join(path.dirname(modelsDir), 'mmprojs');
  let globalMmprojFiles = [];
  try {
    globalMmprojFiles = fs.readdirSync(mmprojsDir)
      .filter(f => path.extname(f).toLowerCase() === '.gguf' && f.toLowerCase().includes('mmproj'))
      .sort();
  } catch { /* dir not found, no global mmprojs */ }

  // 多模态投影文件选择 (可选)
  // 支持包内自动发现和平铺全局匹配
  const hasGlobalMmprojs = globalMmprojFiles.length > 0;

  // 检查模型是否处于"可跳过 mmproj 问题"的状态
  function shouldSkipMmprojQuestion(rawModel) {
    if (!rawModel) return !hasGlobalMmprojs; // 无模型且无全局 mmproj → 跳过

    const modelPath = options.model ? path.resolve(rawModel) : rawModel;
    const pkgMmprojs = getPackageMmprojFiles(modelPath);

    if (pkgMmprojs.length === 1) {
      // 包内 1 个 mmproj → 自动使用，不询问
      return true;
    }
    if (pkgMmprojs.length > 1) {
      return false; // 多个 mmproj → 让用户选
    }

    // 包内无 mmproj → 检查全局
    if (!hasGlobalMmprojs) return true; // 没有全局 mmproj → 跳过
    return false; // 有全局 mmproj → 显示让用户选
  }

  // 获取 mmproj 选项列表
  function getMmprojChoices(rawModel) {
    if (!rawModel) {
      return ['None', ...globalMmprojFiles];
    }

    const modelPath = options.model ? path.resolve(rawModel) : rawModel;
    const pkgMmprojs = getPackageMmprojFiles(modelPath);

    if (pkgMmprojs.length > 0) {
      // 包模型：只显示包内的 mmproj 文件
      const choices = ['None'];
      for (const f of pkgMmprojs) {
        choices.push({ name: `📦 ${f} (from package)`, value: f });
      }
      return choices;
    }

    // 平铺模型：传统行为
    const choices = [];
    const matched = matchMmprojToFile(modelPath, [...globalMmprojFiles]);
    if (matched) {
      choices.push({ name: `${matched} ⭐ (auto-matched)`, value: matched });
      choices.push({ name: 'None', value: 'None' });
    } else {
      choices.push('None', ...globalMmprojFiles);
    }
    return choices;
  }

  // 获取 mmproj 默认值
  function getMmprojDefault(rawModel) {
    if (!rawModel) return 'None';

    const modelPath = options.model ? path.resolve(rawModel) : rawModel;
    const pkgMmprojs = getPackageMmprojFiles(modelPath);

    if (pkgMmprojs.length > 0) {
      // 包模型：如果有精确 1 个，自动选；否则 None（让用户选）
      return pkgMmprojs.length === 1 ? pkgMmprojs[0] : 'None';
    }

    // 平铺模型
    const matched = matchMmprojToFile(modelPath, [...globalMmprojFiles]);
    return matched || 'None';
  }

  questions.push({
    type: 'list',
    name: 'mmproj',
    message: 'Select a multimodal projection file (optional):',
    choices: (answers) => {
      const rawModel = options.model || answers.model;
      return getMmprojChoices(rawModel);
    },
    default: (answers) => {
      const rawModel = options.model || answers.model;
      return getMmprojDefault(rawModel);
    },
    when: (answers) => {
      // CLI 模式：总是显示（用户需要手动确认）
      if (options.model) {
        return getMmprojChoices(options.model).length > 1; // 有可选 mmproj 才显示
      }
      // 交互模式：根据模型上下文决定是否跳过
      return !shouldSkipMmprojQuestion(answers.model);
    },
    suffix: chalk.dim(' (for image/video analysis)')
  });

  // Context Size
  questions.push({
    type: 'list',
    name: 'ctxSize',
    message: 'Context size:',
    choices: [
      { name: '1K  (1024)  - 最小内存占用', value: '1024' },
      { name: '2K  (2048)  - 低内存模式', value: '2048' },
      { name: '4K  (4096)  - 标准模式', value: '4096' },
      { name: '8K  (8192)  - 中等上下文', value: '8192' },
      { name: '16K (16384) - 较长上下文', value: '16384' },
      { name: '32K (32768) - 推荐默认', value: '32768' },
      { name: '64K (65536) - 大上下文 (需要更多 VRAM)', value: '65536' },
      { name: '128K (131072) - 超大上下文 (高 VRAM 占用)', value: '131072' },
      { name: '自定义输入...', value: '__custom__' }
    ],
    default: (() => {
      const defaultVal = options.ctxSize || '32768';
      const idx = ['1024', '2048', '4096', '8192', '16384', '32768', '65536', '131072'].indexOf(defaultVal);
      return idx >= 0 ? idx : 5; // 默认选中 32K
    })()
  });

  // 自定义 Context Size（仅当选择"自定义输入"时显示）
  questions.push({
    type: 'input',
    name: 'ctxSizeCustom',
    message: 'Enter custom context size:',
    default: '32768',
    when: (answers) => answers.ctxSize === '__custom__',
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

  // Threads
  questions.push({
    type: 'input',
    name: 'threads',
    message: 'Number of threads:',
    default: options.threads || '6',
    validate: (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 1) {
        return 'Please enter a valid positive number (minimum 1)';
      }
      return true;
    },
    suffix: chalk.dim(' (1 = single thread, higher = faster but more CPU usage)')
  });

  // GPU 层数模式选择
  questions.push({
    type: 'list',
    name: 'gpuLayersMode',
    message: 'GPU layers offload mode:',
    choices: [
      { name: 'Auto (llama.cpp 自动分配)', value: 'auto', description: '让 llama.cpp 自动决定 GPU 层数' },
      { name: 'Calculated (根据 VRAM 计算)', value: 'calculated', description: '根据模型大小和可用 VRAM 自动计算最优层数' },
      { name: 'Manual (手动设置)', value: 'manual', description: '手动指定 GPU 层数' }
    ],
    default: options.gpuLayersMode || 'auto'
  });

  // GPU 层数手动设置（仅当选择 Manual 模式时显示）
  questions.push({
    type: 'input',
    name: 'gpuLayers',
    message: 'Number of GPU layers (-ngl):',
    default: options.gpuLayers || '99',
    when: (answers) => answers.gpuLayersMode === 'manual',
    validate: (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 0) {
        return 'Please enter a valid non-negative number';
      }
      return true;
    },
    suffix: chalk.dim(' (99 = all layers, 0 = CPU only)')
  });

  // 额外参数
  questions.push({
    type: 'input',
    name: 'extraArgs',
    message: 'Additional llama arguments (optional):',
    default: options.extraArgs || '-b 1024 -ub 128 -fa auto',
    suffix: chalk.dim(' (e.g., --n-gpu-layers 35)\n    \x1b[90mFor image support with Cherry Studio: --cache-type-k q8_0 --no-mmap\x1b[0m')
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
