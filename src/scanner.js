const fs = require('fs');
const path = require('path');

/**
 * 扫描指定目录下的所有GGUF文件
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

module.exports = {
  scanGGUFFiles
};
