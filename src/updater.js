const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 配置
const GITHUB_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
// 支持多种命名格式（按优先级排序）
const ZIP_FILE_PATTERNS = [
  /^llama-.*-bin-win-cuda-12.*x64\.zip$/i,    // 完整 llama.cpp 二进制（优先）
  /^cudart-llama-bin-win-cuda-12.*x64\.zip$/i  // 仅 CUDA DLL
];
const LLAMA_SERVER_PATH = path.join(__dirname, '..', 'llama-cuda-12', 'llama-server.exe');

/**
 * 获取代理配置
 */
function getProxyConfig() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    return proxy; // 返回完整的代理 URL 字符串
  }
  return null;
}

/**
 * 获取 GitHub 最新 release 版本信息
 * @returns {Promise<{version: string, downloadUrl: string, publishedAt: string, assetName: string}>}
 */
async function getLatestReleaseInfo() {
  return new Promise((resolve, reject) => {
    const fetchWithRedirect = (url, maxRedirects = 3) => {
      return new Promise((resolveReq, rejectReq) => {
        const options = { headers: { 'User-Agent': 'gguf-runner' } };
        const proxyUrl = getProxyConfig();
        
        // 使用 HttpsProxyAgent 处理 HTTPS over HTTP 代理
        if (proxyUrl) {
          options.agent = new HttpsProxyAgent(proxyUrl);
        }

        https.get(url, options, (res) => {
          // 处理重定向
          if (res.statusCode === 301 || res.statusCode === 302) {
            if (maxRedirects > 0 && res.headers.location) {
              fetchWithRedirect(res.headers.location, maxRedirects - 1)
                .then(resolveReq)
                .catch(rejectReq);
              return;
            } else {
              rejectReq(new Error('Too many redirects or missing location header'));
              return;
            }
          }

          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              resolveReq(JSON.parse(data));
            } catch (e) {
              rejectReq(new Error(`Failed to parse JSON: ${e.message}`));
            }
          });
        }).on('error', rejectReq);
      });
    };

    fetchWithRedirect(GITHUB_API)
      .then((release) => {
        if (!release.assets || !Array.isArray(release.assets)) {
          reject(new Error('Invalid release data from GitHub API'));
          return;
        }

        // 查找 CUDA 12 的 Windows 资源 - 按模式优先级查找
        let asset = null;
        for (const pattern of ZIP_FILE_PATTERNS) {
          asset = release.assets.find(a => pattern.test(a.name));
          if (asset) break;
        }

        if (!asset) {
          const availableAssets = release.assets.map(a => a.name).filter(n => n.toLowerCase().includes('cuda'));
          reject(new Error(`Could not find CUDA 12 x64 binary in release ${release.tag_name}.\nAvailable CUDA assets: ${availableAssets.slice(0, 5).join(', ')}...`));
          return;
        }

        resolve({
          version: release.tag_name,
          downloadUrl: asset.browser_download_url,
          publishedAt: release.published_at,
          assetName: asset.name
        });
      })
      .catch((error) => {
        reject(error);
      });
  });
}

/**
 * 从 llama-server --version 获取本地版本
 * @param {string} installDir - 安装目录
 * @returns {string|null} 本地版本号，如果不存在则返回 null
 */
function getLocalVersionFromBinary(installDir) {
  const { spawnSync } = require('child_process');
  
  try {
    const llamaServerPath = path.join(installDir, 'llama-server.exe');
    if (!fs.existsSync(llamaServerPath)) {
      return null;
    }
    
    // 捕获 stderr（版本信息输出到 stderr）
    const result = spawnSync(llamaServerPath, ['--version'], { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    
    // 从 stderr 解析版本：version: 8756 (b136b62cf)
    const output = result.stderr || '';
    const match = output.match(/version:\s*(\d+)\s*\(([^)]+)\)/);
    if (match) {
      const buildNumber = match[1];
      const commitHash = match[2];
      return `b${buildNumber} (${commitHash})`;
    }
  } catch (error) {
    // 忽略错误，返回 null
  }
  return null;
}

/**
 * 获取本地版本（优先从二进制文件读取，其次从.version 文件）
 * @param {string} installDir - 安装目录
 * @returns {string|null} 本地版本号，如果不存在则返回 null
 */
function getLocalVersion(installDir) {
  // 优先从二进制文件获取版本
  const binaryVersion = getLocalVersionFromBinary(installDir);
  if (binaryVersion) {
    return binaryVersion;
  }
  
  // 其次从.version 文件获取
  const versionFilePath = path.join(installDir, '.version');
  if (fs.existsSync(versionFilePath)) {
    return fs.readFileSync(versionFilePath, 'utf-8').trim();
  }
  
  return null;
}

/**
 * 保存本地版本
 * @param {string} installDir - 安装目录
 * @param {string} version - 版本号
 */
function saveLocalVersion(installDir, version) {
  const versionFilePath = path.join(installDir, '.version');
  fs.writeFileSync(versionFilePath, version, 'utf-8');
}

/**
 * 解析版本号（提取 build 号进行比较）
 * @param {string} version - 版本号字符串 (e.g., "b8760" 或 "b8756 (abc123)" 或 "0.3.14")
 * @returns {object} 可比较的版本对象
 */
function parseVersion(version) {
  // 处理 b8760 (hash) 格式或 b8760 格式
  const buildMatch = version.match(/^b(\d+)/);
  if (buildMatch) {
    return { type: 'build', number: parseInt(buildMatch[1]) };
  }

  // 处理语义化版本 (e.g., "0.3.14")
  const semverMatch = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (semverMatch) {
    return {
      type: 'semver',
      major: parseInt(semverMatch[1]),
      minor: parseInt(semverMatch[2]),
      patch: parseInt(semverMatch[3])
    };
  }

  // 未知格式，直接比较字符串
  return { type: 'unknown', value: version };
}

/**
 * 比较版本号
 * @param {string} v1 - 版本 1
 * @param {string} v2 - 版本 2
 * @returns {number} 1: v1 > v2, -1: v1 < v2, 0: 相等
 */
function compareVersions(v1, v2) {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  // 如果都是 build 号格式
  if (parsed1.type === 'build' && parsed2.type === 'build') {
    return parsed1.number > parsed2.number ? 1 : parsed1.number < parsed2.number ? -1 : 0;
  }

  // 如果都是语义化版本
  if (parsed1.type === 'semver' && parsed2.type === 'semver') {
    if (parsed1.major !== parsed2.major) return parsed1.major > parsed2.major ? 1 : -1;
    if (parsed1.minor !== parsed2.minor) return parsed1.minor > parsed2.minor ? 1 : -1;
    return parsed1.patch > parsed2.patch ? 1 : parsed1.patch < parsed2.patch ? -1 : 0;
  }

  // 不同类型，回退到字符串比较
  if (v1 === v2) return 0;
  return v1 > v2 ? 1 : -1;
}

/**
 * 下载文件（支持代理）
 * @param {string} url - 下载链接
 * @param {string} dest - 目标路径
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<void>}
 */
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'gguf-runner' } };
    const proxyUrl = getProxyConfig();

    // 使用 HttpsProxyAgent 处理 HTTPS over HTTP 代理
    if (proxyUrl) {
      options.agent = new HttpsProxyAgent(proxyUrl);
    }

    https.get(url, options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
        return;
      }

      const totalSize = parseInt(res.headers['content-length'], 10);
      let downloadedSize = 0;

      const file = fs.createWriteStream(dest);

      res.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
          const mb = (downloadedSize / 1024 / 1024).toFixed(2);
          const totalMb = (totalSize / 1024 / 1024).toFixed(2);
          onProgress(percent, mb, totalMb);
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (error) => {
        fs.unlink(dest, () => {});
        reject(error);
      });
    }).on('error', (error) => {
      reject(new Error(`Download failed: ${error.message}`));
    });
  });
}

/**
 * 解压 ZIP 文件到目标目录
 * @param {string} zipPath - ZIP 文件路径
 * @param {string} destDir - 目标目录
 */
function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

/**
 * 检查更新
 * @param {string} installDir - 安装目录
 * @returns {Promise<{hasUpdate: boolean, localVersion: string|null, remoteVersion: string, downloadUrl: string, assetName: string, publishedAt: string}>}
 */
async function checkUpdate(installDir) {
  const localVersion = getLocalVersion(installDir);
  const releaseInfo = await getLatestReleaseInfo();

  let hasUpdate = false;
  if (!localVersion) {
    hasUpdate = true;
  } else {
    hasUpdate = compareVersions(releaseInfo.version, localVersion) > 0;
  }

  return {
    hasUpdate,
    localVersion,
    remoteVersion: releaseInfo.version,
    downloadUrl: releaseInfo.downloadUrl,
    publishedAt: releaseInfo.publishedAt,
    assetName: releaseInfo.assetName
  };
}

/**
 * 执行更新
 * @param {string} installDir - 安装目录
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function update(installDir, onProgress) {
  const releaseInfo = await getLatestReleaseInfo();
  const tempDir = path.join(installDir, 'temp_download');
  const zipPath = path.join(tempDir, releaseInfo.assetName);

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    if (onProgress) onProgress({ stage: 'downloading', percent: 0 });
    await downloadFile(releaseInfo.downloadUrl, zipPath, (percent, mb, totalMb) => {
      if (onProgress) onProgress({ stage: 'downloading', percent: parseFloat(percent), downloaded: mb, total: totalMb });
    });

    if (onProgress) onProgress({ stage: 'extracting' });
    extractZip(zipPath, installDir);

    fs.unlinkSync(zipPath);
    fs.rmdirSync(tempDir);

    saveLocalVersion(installDir, releaseInfo.version);

    if (onProgress) onProgress({ stage: 'completed', version: releaseInfo.version });

    return {
      success: true,
      message: `Successfully updated to ${releaseInfo.version}`
    };
  } catch (error) {
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (e) {}

    if (onProgress) onProgress({ stage: 'error', error: error.message });
    return {
      success: false,
      message: `Update failed: ${error.message}`
    };
  }
}

/**
 * 获取下载信息（用于手动下载）
 * @returns {Promise<{downloadUrl: string, assetName: string, version: string}>}
 */
async function getDownloadInfo() {
  const releaseInfo = await getLatestReleaseInfo();
  return {
    downloadUrl: releaseInfo.downloadUrl,
    assetName: releaseInfo.assetName,
    version: releaseInfo.version
  };
}

module.exports = {
  getLatestReleaseInfo,
  getLocalVersion,
  saveLocalVersion,
  compareVersions,
  checkUpdate,
  update,
  getDownloadInfo,
  LLAMA_SERVER_PATH
};
