const path = require('path');

/**
 * 构建llama命令字符串
 * @param {Object} config - 配置对象
 * @param {string} config.model - 模型文件名
 * @param {string} config.ctxSize - 上下文大小
 * @param {string} config.host - 服务器主机
 * @param {string} config.port - 服务器端口
 * @param {string} config.extraArgs - 额外参数
 * @param {string} config.llamaCommand - llama命令名称(默认llama-server)
 * @returns {string} 完整的命令字符串
 */
function buildLlamaCommand(config) {
  // 使用相对路径,直接使用模型文件名
  const modelPath = config.model;
  const llamaCmd = config.llamaCommand || 'llama-server';
  
  // 基础命令
  let command = llamaCmd;
  
  // 必需参数
  command += ` -m "${modelPath}"`;
  command += ` --ctx-size ${config.ctxSize}`;
  command += ` --host ${config.host}`;
  command += ` --port ${config.port}`;
  
  // 固定参数(本机使用)
  command += ` -np 1`;
  command += ` --chat-template-kwargs '{"enable_thinking": false}'`;
  
  // 额外参数
  if (config.extraArgs && config.extraArgs.trim() !== '') {
    command += ` ${config.extraArgs.trim()}`;
  }
  
  return command;
}

/**
 * 构建命令参数数组(用于spawn)
 * @param {Object} config - 配置对象
 * @returns {Object} {command: string, args: string[]}
 */
function buildLlamaArgs(config) {
  // 使用相对路径,直接使用模型文件名
  const modelPath = config.model;
  const llamaCmd = config.llamaCommand || 'llama-server';
  
  const args = [
    '-m', modelPath,
    '--ctx-size', config.ctxSize,
    '--host', config.host,
    '--port', config.port,
    // 固定参数(本机使用)
    '-np', '1',
    '--chat-template-kwargs', '{"enable_thinking": false}'
  ];
  
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
