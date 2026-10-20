const fs = require('fs');
const path = require('path');

/**
 * 扫描指定目录下的所有GGUF文件（传统平铺模式）
 * @param {string} dirPath - 要扫描的目录路径
 * @returns {string[]} GGUF文件名数组
 */
function scanGGUFFiles(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);

    // 过滤出.gguf文件
    const ggufFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.gguf';
    });

    // 按文件名排序
    ggufFiles.sort();

    return ggufFiles;
  } catch (error) {
    throw new Error(`Failed to scan directory: ${error.message}`);
  }
}

/**
 * 扫描单个模型包目录
 * 模型包 = models/ 下的子目录，内部可含：
 *   - .gguf 模型文件（不含 "mmproj" 的文件名）
 *   - .gguf 投影文件（文件名含 "mmproj"）
 *   - _profile.json（可选：模型专属参数配置）
 *
 * @param {string} modelsDir - models 目录
 * @param {string} packageName - 包目录名
 * @returns {Object} 包扫描结果
 */
function scanPackage(modelsDir, packageName) {
  const packageDir = path.join(modelsDir, packageName);
  const entries = fs.readdirSync(packageDir);

  const models = [];
  const mmprojFiles = [];
  let packageProfile = null;

  for (const entry of entries) {
    const entryPath = path.join(packageDir, entry);
    let stat;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }

    if (stat.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (ext === '.gguf') {
        if (entry.toLowerCase().includes('mmproj')) {
          mmprojFiles.push(entry);
        } else {
          models.push(entry);
        }
      } else if (entry === '_profile.json') {
        try {
          const raw = fs.readFileSync(entryPath, 'utf8');
          packageProfile = JSON.parse(raw);
          console.log(`[Package] Loaded profile: ${packageName}/_profile.json`);
        } catch (e) {
          console.warn(`[Package] Failed to load ${packageName}/_profile.json: ${e.message}`);
        }
      }
    }
  }

  models.sort();
  mmprojFiles.sort();

  return { packageName, packageDir, models, mmprojFiles, profile: packageProfile };
}

/**
 * 扫描 models 目录，同时支持：
 * 1. 传统平铺 .gguf 文件（向后兼容）
 * 2. 模型包子目录（每个子目录包含模型 + mmproj + 可选 _profile.json）
 *
 * 返回的模型条目数组排序规则：包模型在前，平铺模型在后
 *
 * @param {string} modelsDir - models 目录路径
 * @returns {Array<Object>} 模型条目数组
 */
function scanModels(modelsDir) {
  const entries = fs.readdirSync(modelsDir);
  const modelEntries = [];
  const packageSet = new Set(); // 记录哪些目录名已被作为包处理

  for (const entry of entries) {
    const entryPath = path.join(modelsDir, entry);
    let stat;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // 模型包目录：扫描其中的所有 .gguf 文件
      const pkg = scanPackage(modelsDir, entry);

      if (pkg.models.length === 0) {
        // 目录中没有模型文件，跳过（可能只是普通目录）
        continue;
      }

      packageSet.add(entry);

      for (const modelFile of pkg.models) {
        const modelStem = path.basename(modelFile, '.gguf');
        modelEntries.push({
          type: 'package',
          packageName: pkg.packageName,
          packageDir: pkg.packageDir,
          fileName: modelFile,
          modelStem: modelStem,
          displayName: `📁 ${pkg.packageName}/${modelStem}`,
          modelPath: path.resolve(pkg.packageDir, modelFile),
          mmprojFiles: pkg.mmprojFiles,
          profile: pkg.profile
        });
      }
    } else if (stat.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (ext === '.gguf' && !entry.toLowerCase().includes('mmproj')) {
        const modelStem = path.basename(entry, '.gguf');
        modelEntries.push({
          type: 'flat',
          packageName: null,
          packageDir: null,
          fileName: entry,
          modelStem: modelStem,
          displayName: `📄 ${modelStem}`,
          modelPath: path.resolve(modelsDir, entry),
          mmprojFiles: [],
          profile: null
        });
      }
    }
  }

  // 排序：包模型按 包名→文件名，平铺模型按文件名
  modelEntries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'package' ? -1 : 1;
    if (a.type === 'package') {
      const pc = (a.packageName || '').localeCompare(b.packageName || '');
      if (pc !== 0) return pc;
    }
    return a.fileName.localeCompare(b.fileName);
  });

  // 为方便查找，构建 modelPath → entry 的映射
  const modelMap = {};
  for (const entry of modelEntries) {
    modelMap[entry.modelPath] = entry;
  }

  return {
    entries: modelEntries,
    modelMap: modelMap,
    hasPackages: packageSet.size > 0,
    packageNames: [...packageSet].sort()
  };
}

module.exports = {
  scanGGUFFiles,
  scanModels,
  scanPackage
};
