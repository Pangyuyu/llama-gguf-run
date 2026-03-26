const path = require('path');

/**
 * 构建 llama 命令字符串
 * @param {Object} config - 配置对象
 * @param {string} config.model - 模型文件名
 * @param {string} config.ctxSize - 上下文大小
 * @param {string} config.host - 服务器主机
 * @param {string} config.port - 服务器端口
 * @param {string} config.extraArgs - 额外参数
 * @param {string} config.llamaCommand - llama 命令名称 (默认 llama-server)
 * @param {string} config.mmproj - 多模态投影文件路径 (可选)
 * @param {boolean} config.enableThinking - 是否启用思考模式 (默认 false)
 * @returns {string} 完整的命令字符串
 */
function buildLlamaCommand(config) {
  // 使用绝对路径
  const modelPath = config.model;
  const llamaCmd = config.llamaCommand || 'llama-server';
  const enableThinking = config.enableThinking !== undefined ? config.enableThinking : false;

  // 基础命令
  let command = llamaCmd;

  // 必需参数
  command += ` -m "${modelPath}"`;
  command += ` --ctx-size ${config.ctxSize}`;
  command += ` --host ${config.host}`;
  command += ` --port ${config.port}`;

  // 多模态投影文件 (如果提供)
  if (config.mmproj) {
    command += ` --mmproj "${config.mmproj}"`;
    // 启用多模态支持
    command += ` --no-mmap`;  // 禁用内存映射，提高多模态性能
    command += ` --cache-type-k q8_0`;  // 使用 8 位量化缓存，减少显存使用
  }

  // 固定参数 (本机使用)
  command += ` -np 1`;

  // 只有关闭思考模式时才传递参数 (Qwen3.5 默认开启思考模式)
  if (!enableThinking) {
    command += ` --chat-template-kwargs '{"enable_thinking": false}'`;
  }

  // 额外参数
  if (config.extraArgs && config.extraArgs.trim() !== '') {
    command += ` ${config.extraArgs.trim()}`;
  }

  return command;
}

/**
 * 构建命令参数数组 (用于 spawn)
 * @param {Object} config - 配置对象
 * @returns {Object} {command: string, args: string[]}
 */
function buildLlamaArgs(config) {
  // 使用绝对路径
  const modelPath = config.model;
  const llamaCmd = config.llamaCommand || 'llama-server';
  const enableThinking = config.enableThinking !== undefined ? config.enableThinking : false;

  const args = [
    '-m', modelPath,
    '--ctx-size', config.ctxSize,
    '--host', config.host,
    '--port', config.port
  ];

  // 多模态投影文件 (如果提供)
  if (config.mmproj) {
    args.push('--mmproj', config.mmproj);
    args.push('--no-mmap');  // 禁用内存映射，提高多模态性能
    // 添加多模态支持参数
    args.push('--cache-type-k', 'q8_0');  // 使用 8 位量化缓存，减少显存使用
  }

  // 固定参数 (本机使用)
  args.push('-np', '1');

  // 只有关闭思考模式时才传递参数 (Qwen3.5 默认开启思考模式)
  if (!enableThinking) {
    args.push('--chat-template-kwargs', '{"enable_thinking": false}');
  }

  // 解析额外参数
  if (config.extraArgs && config.extraArgs.trim() !== '') {
    const extraParts = config.extraArgs.trim().split(/\s+/);
    args.push(...extraParts);
  }

  return {
    command: llamaCmd,
    args: args
  };
}

module.exports = {
  buildLlamaCommand,
  buildLlamaArgs
};
