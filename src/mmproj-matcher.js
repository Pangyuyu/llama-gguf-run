const fs = require('fs');
const path = require('path');

// 配置文件路径 - 不固定，在使用时根据 models 目录动态确定
let CONFIG_PATH = null;

/**
 * 设置配置文件路径（基于 models 目录）
 * @param {string} modelsDir - models 目录路径
 */
function setConfigPath(modelsDir) {
  CONFIG_PATH = path.join(modelsDir, '..', 'model-profiles.json');
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
    if (!CONFIG_PATH) return null;
    if (fs.existsSync(CONFIG_PATH)) {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      return config;
    }
  } catch (error) {
    console.warn('Warning: Failed to load model-profiles.json:', error.message);
  }
  return null;
}

/**
 * 扫描 mmprojs 目录下的所有投影文件
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
 * 获取模型目录中的 mmproj 文件（包内自动发现）
 * @param {string} modelPath - 模型文件的绝对路径
 * @returns {string[]} 同目录下的 mmproj 文件列表
 */
function getPackageMmprojFiles(modelPath) {
  const modelDir = path.dirname(modelPath);
  try {
    const entries = fs.readdirSync(modelDir);
    return entries.filter(e => {
      const ext = path.extname(e).toLowerCase();
      return ext === '.gguf' && e.toLowerCase().includes('mmproj');
    }).sort();
  } catch {
    return [];
  }
}

/**
 * 判断模型是否在包目录中
 * @param {string} modelPath - 模型文件绝对路径
 * @param {string} modelsDir - models 目录路径
 * @returns {boolean}
 */
function isPackageModel(modelPath, modelsDir) {
  const modelDir = path.dirname(modelPath);
  return modelDir !== path.resolve(modelsDir);
}

/**
 * 获取包内 _profile.json 配置
 * @param {string} modelPath - 模型文件绝对路径
 * @returns {Object|null} { args, thinkingMode } 或 null
 */
function getPackageProfile(modelPath) {
  const modelDir = path.dirname(modelPath);
  const profilePath = path.join(modelDir, '_profile.json');
  try {
    if (fs.existsSync(profilePath)) {
      const raw = fs.readFileSync(profilePath, 'utf8');
      const profile = JSON.parse(raw);
      console.log(`[Package] Loaded profile from ${path.basename(modelDir)}/_profile.json`);
      return {
        args: profile.args || {},
        thinkingMode: profile.thinkingMode || 'chat-template-kwargs'
      };
    }
  } catch (e) {
    console.warn(`[Package] Failed to load _profile.json: ${e.message}`);
  }
  return null;
}

/**
 * 根据模型文件名自动匹配 mmproj 文件
 * 匹配规则：
 * 1. 优先使用配置文件中的精确映射关系（mmproj -> [modelNames]）
 * 2. 如果没有匹配到，返回 null，让用户手动选择
 *
 * @param {string} modelFile - 模型文件名
 * @param {string[]} mmprojFiles - mmproj 文件列表
 * @returns {string|null} 匹配的 mmproj 文件名，如果没有匹配则返回 null
 */
function matchMmprojToFile(modelFile, mmprojFiles) {
  if (!mmprojFiles || mmprojFiles.length === 0) {
    return null;
  }

  const modelName = path.basename(modelFile, '.gguf');

  // 1. 优先使用配置文件精确匹配
  const config = loadConfig();
  if (config && config.mmproj && config.mmproj.matches) {
    for (const [mmproj, modelNames] of Object.entries(config.mmproj.matches)) {
      if (!mmprojFiles.includes(mmproj)) {
        continue;
      }
      if (modelNames.includes(modelName)) {
        console.log(`✓ Auto-matched: ${modelName} → ${mmproj} (config)`);
        return mmproj;
      }
    }
  }

  // 2. 没有匹配到，返回 null
  console.log(`✗ No matching mmproj found for: ${modelName} (manual selection required)`);
  return null;
}

/**
 * 获取 mmproj 选项 - 同时支持包模型和平铺模型
 *
 * @param {string} mmprojsDir - 全局 mmprojs 目录路径
 * @param {string} modelsDir - models 目录路径（用于查找配置文件）
 * @param {string} modelFile - 模型文件名（平铺模型匹配用）
 * @param {Object} [modelInfo] - 模型条目信息（来自 scanModels）
 * @param {string} [modelInfo.type] - 'package' | 'flat'
 * @param {string[]} [modelInfo.mmprojFiles] - 包内 mmproj 文件列表
 * @returns {Object} { files: string[], matched: string|null, fromPackage: boolean }
 */
function getMmprojOptions(mmprojsDir, modelsDir, modelFile = null, modelInfo = null) {
  // 包模型：mmproj 来自包内
  if (modelInfo && modelInfo.type === 'package') {
    const matched = modelInfo.mmprojFiles.length === 1 ? modelInfo.mmprojFiles[0] : null;
    console.log(`[Package] Package mmproj files: [${modelInfo.mmprojFiles.join(', ')}]`);
    return {
      files: modelInfo.mmprojFiles,
      matched: matched,
      fromPackage: true
    };
  }

  // 平铺模型：传统方式
  setConfigPath(modelsDir);
  const files = scanMmprojFiles(mmprojsDir);
  let matched = null;

  if (modelFile && files.length > 0) {
    matched = matchMmprojToFile(modelFile, files);
  }

  return {
    files,
    matched,
    fromPackage: false
  };
}

module.exports = {
  scanMmprojFiles,
  matchMmprojToFile,
  getMmprojOptions,
  getPackageMmprojFiles,
  getPackageProfile,
  isPackageModel,
  loadConfig,
  setConfigPath,
  getConfigPath
};
