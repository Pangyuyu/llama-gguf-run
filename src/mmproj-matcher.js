const fs = require('fs');
const path = require('path');

// 配置文件路径 - 不固定，在使用时根据 models 目录动态确定
let CONFIG_PATH = null;

/**
 * 设置配置文件路径（基于 models 目录）
 * @param {string} modelsDir - models 目录路径
 */
function setConfigPath(modelsDir) {
  CONFIG_PATH = path.join(modelsDir, '..', 'mmproj-matcher.json');
}

/**
 * 获取当前配置文件路径
 * @returns {string|null}
 */
function getConfigPath() {
  return CONFIG_PATH;
}

/**
 * 加载配置文件
 * @returns {Object|null} 配置对象
 */
function loadConfig() {
  try {
    console.log(`[Config] Checking: ${CONFIG_PATH}`);
    if (fs.existsSync(CONFIG_PATH)) {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      console.log(`[Config] Loaded successfully, matches:`, Object.keys(config.mmproj?.matches || {}));
      return config;
    } else {
      console.log(`[Config] File not found`);
    }
  } catch (error) {
    console.warn('Warning: Failed to load mmproj-matcher.json:', error.message);
  }
  return null;
}

/**
 * 扫描 mmprojs 目录下的所有.mmproj 文件
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
 * 根据模型文件名自动匹配 mmproj 文件
 * 匹配规则：
 * 1. 优先使用配置文件中的映射关系
 * 2. 模型名和 mmproj 文件名包含相同的关键词（如 Qwen3.5）
 * 3. mmproj 文件名包含模型的主要标识
 *
 * @param {string} modelFile - 模型文件名
 * @param {string[]} mmprojFiles - mmproj 文件列表
 * @returns {string|null} 匹配的 mmproj 文件名，如果没有匹配则返回 null
 */
function matchMmprojToFile(modelFile, mmprojFiles) {
  if (!mmprojFiles || mmprojFiles.length === 0) {
    console.log(`[Match] No mmproj files available`);
    return null;
  }

  const modelName = path.basename(modelFile, '.gguf');
  console.log(`[Match] Matching model: ${modelName}`);
  console.log(`[Match] Available mmproj files:`, mmprojFiles);

  // 1. 优先使用配置文件匹配
  const config = loadConfig();
  if (config && config.mmproj && config.mmproj.matches) {
    // 检查配置文件中的映射
    for (const [keyword, mmproj] of Object.entries(config.mmproj.matches)) {
      if (modelName.toLowerCase().includes(keyword.toLowerCase())) {
        if (mmprojFiles.includes(mmproj)) {
          console.log(`✓ Auto-matched: ${modelName} → ${mmproj} (config)`);
          return mmproj;  // ✅ 配置文件匹配成功，直接返回
        }
      }
    }
  }

  // 2. 使用文件名关键词匹配（精确匹配）
  const modelIdentifiers = extractModelIdentifiers(modelName);

  for (const identifier of modelIdentifiers) {
    for (const mmproj of mmprojFiles) {
      const mmprojName = path.basename(mmproj, '.gguf').toLowerCase();
      // 检查 mmproj 文件名是否包含模型的标识
      if (mmprojName.includes(identifier.toLowerCase())) {
        console.log(`✓ Auto-matched: ${modelName} → ${mmproj} (keyword: ${identifier})`);
        return mmproj;
      }
    }
  }

  // 3. 如果没有精确匹配，尝试找通用的 mmproj
  const genericMmproj = findGenericMmproj(mmprojFiles);
  if (genericMmproj) {
    console.log(`✓ Auto-matched: ${modelName} → ${genericMmproj} (generic)`);
    return genericMmproj;
  }

  console.log(`✗ No matching mmproj found for: ${modelName}`);
  return null;
}

/**
 * 从模型名中提取标识符
 * @param {string} modelName - 模型名（不含扩展名）
 * @returns {string[]} 标识符列表
 */
function extractModelIdentifiers(modelName) {
  const identifiers = [];
  
  // 提取主要模型系列名
  // 例如：Qwen3.5-35B-A3B-Q4_K_M -> Qwen3.5, Qwen
  const parts = modelName.split(/[-_]/);
  
  // 添加完整的前缀（通常是模型系列名）
  if (parts.length > 0) {
    // 添加完整的第一部分（如 Qwen3.5）
    identifiers.push(parts[0]);
    
    // 如果有版本号，添加带版本的（如 Qwen3.5）
    const versionMatch = parts[0].match(/([A-Za-z]+[\d.]+)/);
    if (versionMatch) {
      identifiers.push(versionMatch[1]);
    }
    
    // 添加不带数字的系列名（如 Qwen）
    const seriesMatch = parts[0].match(/([A-Za-z]+)/);
    if (seriesMatch) {
      identifiers.push(seriesMatch[1]);
    }
  }

  return [...new Set(identifiers)]; // 去重
}

/**
 * 查找通用的 mmproj 文件
 * @param {string[]} mmprojFiles - mmproj 文件列表
 * @returns {string|null} 通用 mmproj 文件名
 */
function findGenericMmproj(mmprojFiles) {
  // 只匹配真正通用的投影文件（文件名格式：mmproj-F16.gguf 或 mmproj-FP16.gguf）
  // 不包含模型系列标识的才是通用文件
  const generic = mmprojFiles.find(f => {
    const name = f.toLowerCase();
    // 通用文件名格式：mmproj-f16.gguf 或 mmproj-fp16.gguf
    return name === 'mmproj-f16.gguf' || name === 'mmproj-fp16.gguf';
  });

  return generic || null;
}

/**
 * 获取 mmproj 文件列表和自动匹配结果
 * @param {string} mmprojsDir - mmprojs 目录路径
 * @param {string} modelsDir - models 目录路径（用于查找配置文件）
 * @param {string} modelFile - 模型文件名（可选，用于自动匹配）
 * @returns {Object} { files: string[], matched: string|null }
 */
function getMmprojOptions(mmprojsDir, modelsDir, modelFile = null) {
  // 设置配置文件路径
  setConfigPath(modelsDir);
  
  const files = scanMmprojFiles(mmprojsDir);
  let matched = null;
  
  if (modelFile && files.length > 0) {
    matched = matchMmprojToFile(modelFile, files);
  }
  
  return {
    files,
    matched
  };
}

module.exports = {
  scanMmprojFiles,
  matchMmprojToFile,
  getMmprojOptions,
  extractModelIdentifiers,
  findGenericMmproj,
  loadConfig,
  setConfigPath,
  getConfigPath
};
