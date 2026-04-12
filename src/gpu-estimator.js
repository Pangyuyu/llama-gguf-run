const fs = require('fs');
const path = require('path');

/**
 * GGUF 文件读取工具 - 读取 GGUF 文件头部的元数据
 * 参考：https://huggingface.co/docs/hub/gguf
 */
class GGUFReader {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * 读取 GGUF 文件的元数据
   * @returns {Promise<Object>} 元数据对象
   */
  async readMetadata() {
    return new Promise((resolve, reject) => {
      try {
        // 检查文件是否存在
        if (!fs.existsSync(this.filePath)) {
          throw new Error(`File not found: ${this.filePath}`);
        }

        const fd = fs.openSync(this.filePath, 'r');

        // 读取 GGUF 魔数 (前 4 字节)
        const magic = Buffer.alloc(4);
        fs.readSync(fd, magic, 0, 4, 0);
        const magicStr = magic.toString('utf8');

        if (magicStr !== 'GGUF') {
          fs.closeSync(fd);
          throw new Error('Not a valid GGUF file');
        }

        // 读取 GGUF 版本 (4 字节，uint32)
        const versionBuf = Buffer.alloc(4);
        fs.readSync(fd, versionBuf, 0, 4, 4);
        const version = versionBuf.readUInt32LE(0);

        // 读取张量数量 (8 字节，uint64)
        const tensorCountBuf = Buffer.alloc(8);
        fs.readSync(fd, tensorCountBuf, 0, 8, 8);
        const tensorCount = Number(tensorCountBuf.readBigUInt64LE(0));

        // 读取元数据键值对数量 (8 字节，uint64)
        const metadataCountBuf = Buffer.alloc(8);
        fs.readSync(fd, metadataCountBuf, 0, 8, 16);
        const metadataCount = Number(metadataCountBuf.readBigUInt64LE(0));

        // 读取元数据
        let offset = 24; // 头部固定大小
        const metadata = {};

        for (let i = 0; i < metadataCount; i++) {
          // 读取键名长度
          const keyLenBuf = Buffer.alloc(8);
          fs.readSync(fd, keyLenBuf, 0, 8, offset);
          const keyLen = Number(keyLenBuf.readBigUInt64LE(0));

          // 检查键名长度是否合理
          if (keyLen > 256 || keyLen <= 0) {
            console.warn(`[GGUFReader] Invalid key length at offset ${offset}: ${keyLen}`);
            break;
          }

          offset += 8;

          // 读取键名
          const keyBuf = Buffer.alloc(keyLen);
          fs.readSync(fd, keyBuf, 0, keyLen, offset);
          const key = keyBuf.toString('utf8');
          offset += keyLen;

          // 读取值类型 (4 字节，uint32)
          const typeBuf = Buffer.alloc(4);
          fs.readSync(fd, typeBuf, 0, 4, offset);
          const valueType = typeBuf.readUInt32LE(0);
          offset += 4;

          // 读取值
          try {
            const { value, size } = this.readValue(valueType, offset, fd);
            metadata[key] = value;
            offset += size;
          } catch (readError) {
            console.warn(`[GGUFReader] Failed to read value for key "${key}" at offset ${offset}: ${readError.message}`);
            // 跳过这个键值对，继续读取下一个
            offset += 8; // 尝试跳过 8 字节
          }
        }

        fs.closeSync(fd);

        resolve({
          version,
          tensorCount,
          metadata,
          filePath: this.filePath
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 读取 GGUF 元数据值
   * @param {number} valueType - 值类型
   * @param {number} offset - 文件偏移量
   * @param {number} fd - 文件描述符
   * @returns {{value: any, size: number}} 值和大小
   */
  readValue(valueType, offset, fd) {
    try {
      switch (valueType) {
        case 0: // uint8
          const uint8Buf = Buffer.alloc(1);
          fs.readSync(fd, uint8Buf, 0, 1, offset);
          return { value: uint8Buf.readUInt8(0), size: 1 };

        case 1: // int8
          const int8Buf = Buffer.alloc(1);
          fs.readSync(fd, int8Buf, 0, 1, offset);
          return { value: int8Buf.readInt8(0), size: 1 };

        case 2: // uint16
          const uint16Buf = Buffer.alloc(2);
          fs.readSync(fd, uint16Buf, 0, 2, offset);
          return { value: uint16Buf.readUInt16LE(0), size: 2 };

        case 3: // int16
          const int16Buf = Buffer.alloc(2);
          fs.readSync(fd, int16Buf, 0, 2, offset);
          return { value: int16Buf.readInt16LE(0), size: 2 };

        case 4: // uint32
          const uint32Buf = Buffer.alloc(4);
          fs.readSync(fd, uint32Buf, 0, 4, offset);
          return { value: uint32Buf.readUInt32LE(0), size: 4 };

        case 5: // int32
          const int32Buf = Buffer.alloc(4);
          fs.readSync(fd, int32Buf, 0, 4, offset);
          return { value: int32Buf.readInt32LE(0), size: 4 };

        case 6: // float32
          const float32Buf = Buffer.alloc(4);
          fs.readSync(fd, float32Buf, 0, 4, offset);
          return { value: float32Buf.readFloatLE(0), size: 4 };

        case 7: // bool
          const boolBuf = Buffer.alloc(1);
          fs.readSync(fd, boolBuf, 0, 1, offset);
          return { value: boolBuf.readUInt8(0) !== 0, size: 1 };

        case 8: { // string
          const strLenBuf = Buffer.alloc(8);
          fs.readSync(fd, strLenBuf, 0, 8, offset);
          const strLen = Number(strLenBuf.readBigUInt64LE(0));

          // 检查字符串长度是否合理（GGUF 元数据中的字符串通常不超过 1KB）
          if (strLen > 1024 || strLen <= 0 || strLen > 0x1000000) {
            console.warn(`[GGUFReader] Invalid string length: ${strLen}, skipping`);
            return { value: null, size: 8 };
          }

          const strBuf = Buffer.alloc(strLen);
          fs.readSync(fd, strBuf, 0, strLen, offset + 8);
          return { value: strBuf.toString('utf8'), size: 8 + strLen };
        }

        case 9: { // array - 跳过不解析
          // 读取数组长度
          const arrLenBuf = Buffer.alloc(8);
          fs.readSync(fd, arrLenBuf, 0, 8, offset);
          const arrLen = Number(arrLenBuf.readBigUInt64LE(0));
          // 跳过整个数组（假设每个元素最多 16 字节）
          const skipSize = arrLen * 16;
          return { value: null, size: 8 + skipSize };
        }

        case 10: // uint64
          const uint64Buf = Buffer.alloc(8);
          fs.readSync(fd, uint64Buf, 0, 8, offset);
          return { value: Number(uint64Buf.readBigUInt64LE(0)), size: 8 };

        case 11: // int64
          const int64Buf = Buffer.alloc(8);
          fs.readSync(fd, int64Buf, 0, 8, offset);
          return { value: Number(int64Buf.readBigInt64LE(0)), size: 8 };

        case 12: // float64
          const float64Buf = Buffer.alloc(8);
          fs.readSync(fd, float64Buf, 0, 8, offset);
          return { value: float64Buf.readDoubleLE(0), size: 8 };

        default:
          console.warn(`[GGUFReader] Unknown value type: ${valueType}`);
          return { value: null, size: 8 };
      }
    } catch (error) {
      console.warn(`[GGUFReader] Error reading value at offset ${offset}: ${error.message}`);
      throw error; // 重新抛出，让上层处理
    }
  }
}

/**
 * 量化类型的 VRAM 估算 (GB per 10B params)
 */
const QUANT_VRAM_FACTOR = {
  'Q2_K': 0.35,
  'Q3_K_S': 0.40,
  'Q3_K_M': 0.43,
  'Q3_K_L': 0.46,
  'Q4_0': 0.50,
  'Q4_K_S': 0.52,
  'Q4_K_M': 0.55,
  'Q5_0': 0.60,
  'Q5_K_S': 0.62,
  'Q5_K_M': 0.65,
  'Q6_K': 0.75,
  'Q8_0': 0.95,
  'QL8_0': 0.95,  // 特殊版本 Q8_0
  'F16': 2.0,
  'F32': 4.0
};

/**
 * 从 GGUF 元数据中提取量化类型
 */
function extractQuantType(metadata) {
  // 从文件名提取量化类型（后备方案）
  const fileName = path.basename(metadata.filePath || '').toUpperCase();

  // 按优先级匹配量化类型（先匹配长的，再匹配短的，避免 Q8 匹配到 Q8_0 之前的 Q8）
  const quants = Object.keys(QUANT_VRAM_FACTOR).sort((a, b) => b.length - a.length);
  for (const quant of quants) {
    if (fileName.includes(quant)) {
      return quant;
    }
  }

  // 检查元数据中的通用类型
  if (metadata['general.type']) {
    const typeStr = metadata['general.type'].toString().toUpperCase();
    for (const quant of Object.keys(QUANT_VRAM_FACTOR)) {
      if (typeStr.includes(quant)) {
        return quant;
      }
    }
  }

  // 默认返回 Q4_K_M 作为保守估计
  return 'Q4_K_M';
}

/**
 * 计算推荐的 GPU 层数
 * @param {string} modelPath - 模型文件路径
 * @param {Object} options - 选项
 * @param {number} options.availableVRAM - 可用 VRAM (GB)，默认 6.5 (8GB 显卡保留 1.5GB 余量)
 * @param {number} options.vramReserve - VRAM 保留余量 (GB)，默认 1.5
 * @param {number} options.ctxSize - 上下文大小，用于计算 KV 缓存，默认 32768
 * @returns {Promise<Object>} { recommendedLayers, totalLayers, quantType, modelSize, availableVRAM, canOffloadAll }
 */
async function calculateRecommendedLayers(modelPath, options = {}) {
  const vramReserve = options.vramReserve || 1.0; // 默认保留 1GB 余量
  const availableVRAM = options.availableVRAM || (8 - vramReserve); // 默认 8GB 显卡 - 1GB 余量 = 7GB
  const ctxSize = options.ctxSize || 32768; // 默认 32K

  try {
    const reader = new GGUFReader(modelPath);
    const { metadata } = await reader.readMetadata();

    // 获取模型层数
    const totalLayers = metadata['llama.block_count'] ||
                        metadata['block_count'] ||
                        metadata['transformer.block_count'] ||
                        32; // 默认 32 层

    // 获取参数量
    const totalParams = metadata['general.parameter_count'] || 0;
    const modelSizeGB = totalParams / 1e9; // 转换为 B (Billion params)

    // 如果参数量为 0，说明元数据读取失败，使用文件名估算
    if (totalParams === 0 || modelSizeGB === 0) {
      console.log(`[GPU Estimator] Parameter count is 0, using file name estimation`);
      return estimateFromFileName(modelPath, availableVRAM, ctxSize);
    }

    // 提取量化类型
    const quantType = extractQuantType({ ...metadata, filePath: modelPath });

    // 获取量化因子
    const vramFactor = QUANT_VRAM_FACTOR[quantType] || 0.55;

    // 计算每层 VRAM 占用 (MB)
    const vramPerLayer = (modelSizeGB * vramFactor * 1024) / totalLayers;

    // 计算 KV 缓存大小 (MB) - 仅供参考，不影响 GPU 层数计算
    // 注意：llama.cpp 默认将 KV 缓存放在系统内存中，不占用 GPU VRAM
    // 除非使用 --cache-type-k q8_0 等参数强制 GPU 缓存
    const activeModelSizeGB = modelSizeGB > 30 ? 3.5 : modelSizeGB > 10 ? modelSizeGB * 0.3 : modelSizeGB; // MoE 优化
    const kvCachePerK = activeModelSizeGB <= 8 ? 1 : activeModelSizeGB <= 20 ? 2 : 3; // MB per 1K context (FP16)
    const kvCacheSize = (ctxSize / 1024) * kvCachePerK;

    // 计算可容纳的层数 (不减去 KV 缓存，因为 llama.cpp 默认使用系统内存)
    const availableForLayers = availableVRAM * 1024;
    const maxOffloadLayers = Math.floor(availableForLayers / vramPerLayer);

    // 推荐层数 (不能超过总层数)
    const recommendedLayers = Math.min(maxOffloadLayers, totalLayers);

    // 是否可以全部卸载
    const canOffloadAll = recommendedLayers >= totalLayers;

    console.log(`[GPU Estimator] Calculated: ${recommendedLayers}/${totalLayers} layers (${quantType}, ~${modelSizeGB.toFixed(2)}GB)`);

    return {
      recommendedLayers,
      totalLayers,
      quantType,
      modelSizeGB: modelSizeGB.toFixed(2),
      availableVRAM: availableVRAM.toFixed(2),
      canOffloadAll,
      vramPerLayer: vramPerLayer.toFixed(2),
      kvCacheSize: kvCacheSize.toFixed(1),
      ctxSize,
      metadata
    };
  } catch (error) {
    console.warn(`[GPU Estimator] Failed to read GGUF metadata: ${error.message}`);
    console.warn('[GPU Estimator] Using fallback estimation based on file name');

    // 后备方案：根据文件名估算
    return estimateFromFileName(modelPath, availableVRAM, ctxSize);
  }
}

/**
 * 后备方案：根据文件名估算
 */
function estimateFromFileName(modelPath, availableVRAM = 7, ctxSize = 32768) {
  const fileName = path.basename(modelPath).toUpperCase();

  // 提取模型大小（从文件名匹配）
  let modelSizeMatch = fileName.match(/(\d+(?:\.\d+)?)B/);
  let modelSizeGB = modelSizeMatch ? parseFloat(modelSizeMatch[1]) : 8; // 默认 8B

  // 提取量化类型
  let quantType = 'Q4_K_M';
  for (const quant of Object.keys(QUANT_VRAM_FACTOR)) {
    if (fileName.includes(quant)) {
      quantType = quant;
      break;
    }
  }

  const vramFactor = QUANT_VRAM_FACTOR[quantType] || 0.55;

  // 估算总 VRAM 需求
  const estimatedTotalVRAM = modelSizeGB * vramFactor;

  // 假设典型层数
  let totalLayers = 32;
  if (modelSizeGB <= 8) totalLayers = 32;
  else if (modelSizeGB <= 14) totalLayers = 40;
  else if (modelSizeGB <= 35) totalLayers = 64;
  else totalLayers = 80;

  const vramPerLayer = (estimatedTotalVRAM * 1024) / totalLayers;

  // 计算可容纳的层数 (不减去 KV 缓存，因为 llama.cpp 默认使用系统内存)
  const availableForLayers = availableVRAM * 1024;
  const maxOffloadLayers = Math.floor(availableForLayers / vramPerLayer);
  const recommendedLayers = Math.min(maxOffloadLayers, totalLayers);

  // KV 缓存估算（仅供参考）
  const activeModelSizeGB = modelSizeGB > 30 ? 3.5 : modelSizeGB > 10 ? modelSizeGB * 0.3 : modelSizeGB;
  const kvCachePerK = activeModelSizeGB <= 8 ? 1 : activeModelSizeGB <= 20 ? 2 : 3;
  const kvCacheSize = (ctxSize / 1024) * kvCachePerK;

  return {
    recommendedLayers,
    totalLayers,
    quantType,
    modelSizeGB: modelSizeGB.toFixed(2),
    availableVRAM: availableVRAM.toFixed(2),
    canOffloadAll: recommendedLayers >= totalLayers,
    vramPerLayer: vramPerLayer.toFixed(2),
    kvCacheSize: kvCacheSize.toFixed(1),
    ctxSize,
    isEstimate: true
  };
}

/**
 * 获取 GPU 层数模式选项
 */
function getGPULayersModeOptions() {
  return [
    { name: 'Auto (llama.cpp 自动分配，默认)', value: 'auto', description: '让 llama.cpp 自动决定 GPU 层数' },
    { name: 'Calculated (根据 VRAM 计算)', value: 'calculated', description: '根据模型大小和可用 VRAM 自动计算最优层数' },
    { name: 'Manual (手动设置)', value: 'manual', description: '手动指定 GPU 层数' }
  ];
}

module.exports = {
  GGUFReader,
  calculateRecommendedLayers,
  estimateFromFileName,
  getGPULayersModeOptions,
  QUANT_VRAM_FACTOR
};
