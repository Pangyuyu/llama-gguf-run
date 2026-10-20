const os = require('os');

const APIPA_PREFIX = '169.254.'; // 自动专用 IP，基本不可用

function isIPv4(addr) {
  return addr.family === 'IPv4' || addr.family === 4;
}

/**
 * 枚举本机可用的 IPv4 地址（含 VMnet 等虚拟网卡）
 * @returns {Array<{address: string, names: string[]}>} 去重后的地址列表
 */
function enumerateIPv4Hosts() {
  const interfaces = os.networkInterfaces();
  const byAddress = new Map();

  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name] || []) {
      if (!isIPv4(addr)) continue;
      if (addr.internal) continue;                    // 回环单独处理
      if (addr.address.startsWith(APIPA_PREFIX)) continue;

      const existing = byAddress.get(addr.address);
      if (existing) {
        if (!existing.names.includes(name)) existing.names.push(name);
      } else {
        byAddress.set(addr.address, { address: addr.address, names: [name] });
      }
    }
  }

  return [...byAddress.values()];
}

/**
 * 构建 Server host 选项列表：回环 + 本机各网卡地址
 * @param {string} [preferredHost] - 命令行 --host 指定的地址（不在列表中时补充为选项）
 * @returns {Array<{name: string, value: string}>} Inquirer 选项
 */
function getHostChoices(preferredHost) {
  const choices = [{ name: '127.0.0.1 (localhost only)', value: '127.0.0.1' }];
  const seen = new Set(['127.0.0.1']);

  for (const { address, names } of enumerateIPv4Hosts()) {
    if (seen.has(address)) continue;
    seen.add(address);
    choices.push({ name: `${address} (${names.join(', ')})`, value: address });
  }

  if (preferredHost && !seen.has(preferredHost)) {
    choices.push({ name: `${preferredHost} (from --host)`, value: preferredHost });
  }

  return choices;
}

/**
 * 计算默认选中项下标
 */
function getDefaultHostIndex(choices, preferredHost) {
  if (!preferredHost) return 0;
  const idx = choices.findIndex(c => c.value === preferredHost);
  return idx >= 0 ? idx : 0;
}

module.exports = { enumerateIPv4Hosts, getHostChoices, getDefaultHostIndex };
