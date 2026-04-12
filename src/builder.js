const path = require('path');
const { calculateRecommendedLayers, estimateFromFileName } = require('./gpu-estimator');

/**
 * 构建 llama 命令字符串
 * @param {Object} config - 配置对象
 * @param {string} config.model - 模型文件名
 * @param {string} config.ctxSize - 上下文大小
 * @param {string} config.host - 服务器主机
 * @param {string} config.port - 服务器端口
 * @param {string} config.temp - 温度
 * @param {string} config.topP - Top-P 采样
 * @param {string} config.extraArgs - 额外参数
 * @param {string} config.llamaCommand - llama 命令名称 (默认 llama-server)
 * @param {string} config.mmproj - 多模态投影文件路径 (可选)
 * @param {boolean} config.enableThinking - 是否启用思考模式 (默认 true)
 * @param {string} config.gpuLayersMode - GPU 层数模式：'auto', 'calculated', 'manual'
 * @param {number} config.gpuLayers - GPU 层数（手动模式）
 * @returns {Promise<Object>} {command: string, gpuInfo: string}
 */
async function buildLlamaCommand(config) {
  // 使用绝对路径
  const modelPath = config.model;
  const llamaCmd = config.llamaCommand || 'llama-server';
  const enableThinking = config.enableThinking !== undefined ? config.enableThinking : true;
  const gpuLayersMode = config.gpuLayersMode || 'auto';

  // 基础命令
  let command = llamaCmd;

  // 必需参数
  command += ` -m "${modelPath}"`;
  command += ` --ctx-size ${config.ctxSize}`;
  command += ` --host ${config.host}`;
  command += ` --port ${config.port}`;
  command += ` --temp ${config.temp}`;
  command += ` --top-p ${config.topP}`;

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

  // 处理 GPU 层数
  let nglValue = '';
  let gpuInfo = '';

  if (gpuLayersMode === 'auto') {
    // Auto 模式：不设置 -ngl，让 llama.cpp 自动决定
    nglValue = '';
    gpuInfo = 'GPU: auto (llama.cpp 自动分配)';
  } else if (gpuLayersMode === 'calculated') {
    // Calculated 模式：根据模型计算
    try {
      const result = await calculateRecommendedLayers(modelPath, { availableVRAM: 7, ctxSize: parseInt(config.ctxSize) || 32768 });
      nglValue = result.recommendedLayers.toString();
      gpuInfo = `GPU: ${result.recommendedLayers}/${result.totalLayers} layers (${result.quantType}, ~${result.modelSizeGB}GB, KV: ${result.kvCacheSize}MB @ ${result.ctxSize})`;
    } catch (error) {
      console.warn(`[GPU Estimator] Calculation failed: ${error.message}, using fallback`);
      // Fallback: 使用文件名估算，确保返回有效的层数
      const fallbackResult = estimateFromFileName(modelPath, 7, parseInt(config.ctxSize) || 32768);
      nglValue = fallbackResult.recommendedLayers.toString();
      gpuInfo = `GPU: ${fallbackResult.recommendedLayers}/${fallbackResult.totalLayers} layers (${fallbackResult.quantType}, ~${fallbackResult.modelSizeGB}GB, KV: ${fallbackResult.kvCacheSize}MB @ ${fallbackResult.ctxSize}) [estimated]`;
    }
  } else if (gpuLayersMode === 'manual') {
    // Manual 模式：使用用户指定的值
    nglValue = config.gpuLayers || '99';
    gpuInfo = `GPU: ${nglValue} layers (manual)`;
  }

  // 添加 -ngl 参数（如果有值）
  if (nglValue !== '' && nglValue !== '0') {
    command += ` -ngl ${nglValue}`;
  }

  // 额外参数
  if (config.extraArgs && config.extraArgs.trim() !== '') {
    // 移除额外参数中可能重复的 -ngl
    const cleanedExtraArgs = config.extraArgs.trim().replace(/-ngl\s+\d+/g, '').trim();
    if (cleanedExtraArgs) {
      command += ` ${cleanedExtraArgs}`;
    }
  }

  return {
    command,
    gpuInfo
  };
}

/**
 * 构建命令参数数组 (用于 spawn)
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} {command: string, args: string[], gpuInfo: string}
 */
async function buildLlamaArgs(config) {
  // 使用绝对路径
  const modelPath = config.model;
  const llamaCmd = config.llamaCommand || 'llama-server';
  const enableThinking = config.enableThinking !== undefined ? config.enableThinking : true;
  const gpuLayersMode = config.gpuLayersMode || 'auto';

  const args = [
    '-m', modelPath,
    '--ctx-size', config.ctxSize,
    '--host', config.host,
    '--port', config.port,
    '--temp', config.temp,
    '--top-p', config.topP
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

  // 处理 GPU 层数
  let nglValue = '';
  let gpuInfo = '';

  if (gpuLayersMode === 'auto') {
    // Auto 模式：不设置 -ngl，让 llama.cpp 自动决定
    nglValue = '';
    gpuInfo = 'GPU: auto';
  } else if (gpuLayersMode === 'calculated') {
    // Calculated 模式：根据模型计算
    try {
      const result = await calculateRecommendedLayers(modelPath, { availableVRAM: 7, ctxSize: parseInt(config.ctxSize) || 32768 });
      nglValue = result.recommendedLayers.toString();
      gpuInfo = `GPU: ${result.recommendedLayers}/${result.totalLayers} layers (${result.quantType}, ~${result.modelSizeGB}GB, KV: ${result.kvCacheSize}MB @ ${result.ctxSize})`;
    } catch (error) {
      console.warn(`[GPU Estimator] Calculation failed: ${error.message}, using fallback`);
      // Fallback: 使用文件名估算，确保返回有效的层数
      const fallbackResult = estimateFromFileName(modelPath, 7, parseInt(config.ctxSize) || 32768);
      nglValue = fallbackResult.recommendedLayers.toString();
      gpuInfo = `GPU: ${fallbackResult.recommendedLayers}/${fallbackResult.totalLayers} layers (${fallbackResult.quantType}, ~${fallbackResult.modelSizeGB}GB, KV: ${fallbackResult.kvCacheSize}MB @ ${fallbackResult.ctxSize}) [estimated]`;
    }
  } else if (gpuLayersMode === 'manual') {
    // Manual 模式：使用用户指定的值
    nglValue = config.gpuLayers || '99';
    gpuInfo = `GPU: ${nglValue} layers (manual)`;
  }

  // 添加 -ngl 参数（如果有值）
  if (nglValue !== '' && nglValue !== '0') {
    args.push('-ngl', nglValue);
  }

  // 解析额外参数
  if (config.extraArgs && config.extraArgs.trim() !== '') {
    // 移除额外参数中可能重复的 -ngl
    const cleanedExtraArgs = config.extraArgs.trim().replace(/-ngl\s+\d+/g, '').trim();
    if (cleanedExtraArgs) {
      const extraParts = cleanedExtraArgs.split(/\s+/);
      args.push(...extraParts);
    }
  }

  return {
    command: llamaCmd,
    args: args,
    gpuInfo
  };
}

module.exports = {
  buildLlamaCommand,
  buildLlamaArgs
};
