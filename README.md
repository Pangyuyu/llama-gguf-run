# GGUF Runner

🦙 一个交互式的命令行工具，用于简化 llama 运行 GGUF 模型的操作流程。

## 功能特性

- ✅ 自动扫描 `models/` 目录下的 GGUF 模型文件
- ✅ 交互式选择模型和配置参数
- ✅ 提供智能默认值 (ctx-size=2048, host=127.0.0.1, port=8080)
- ✅ 支持命令行参数覆盖默认值
- ✅ 允许添加额外的 llama 参数
- ✅ 实时显示命令执行过程

## 快速开始

### 统一入口命令（推荐）

```bash
gguf
```

![gguf 主菜单](images/gguf.png)

### 启动模型服务器

```bash
gguf run
```

![gguf run](images/gguf-run.png)

### 检查更新

```bash
gguf check
```

![gguf check](images/gguf-check.png)

## 安装

### 前置要求

- Node.js v14 或更高版本
- llama 已安装并配置到环境变量中
- 创建 `models/` 目录并放入 `.gguf` 模型文件

### 获取 GGUF 模型

本项目不包含模型文件，您需要自行下载 GGUF 格式的模型放入 `models/` 目录。

**推荐下载源**:

1. **Hugging Face** (官方): https://huggingface.co/
   - 搜索 `GGUF` 格式的模型，如 `Qwen/Qwen3.5-7B-GGUF`
   - 使用 `huggingface-cli` 下载:
     ```bash
     huggingface-cli download Qwen/Qwen3.5-7B-GGUF qwen3.5-7b-q4_k_m.gguf --local-dir models/
     ```

2. **Hugging Face 镜像** (国内加速):
   - 使用 HF-Mirror: https://hf-mirror.com/
   - 设置镜像环境变量后下载:
     ```bash
     set HF_ENDPOINT=https://hf-mirror.com
     huggingface-cli download Qwen/Qwen3.5-7B-GGUF qwen3.5-7b-q4_k_m.gguf --local-dir models/
     ```

3. **ModelScope** (阿里魔搭): https://modelscope.cn/
   - 国内模型仓库，部分模型提供 GGUF 格式

**注意**: 请确保下载的模型文件扩展名为 `.gguf`，并将其放置在 `models/` 目录中。

### 目录结构

```
your-project/
├── bin/
│   ├── gguf              # 统一入口命令 ⭐ 推荐
│   ├── gguf-run          # 启动模型服务器
│   └── gguf-updater      # 版本更新工具
├── src/                  # 源代码
├── llama-cuda-12/         # llama.cpp CUDA 12 二进制文件 ⭐
├── models/                # ⭐ 模型目录（支持平铺和包两种模式）
│   ├── ...平铺模式（传统方式）
│   ├── model1.gguf
│   ├── model2.gguf
│   ├── ...包模式 ⭐ 推荐（模型+投影+配置自动发现）
│   ├── qwen3.5-35b/
│   │   ├── Q4_K_M.gguf        # 模型文件（支持多量化版本）
│   │   ├── Q5_K_M.gguf
│   │   ├── mmproj-f16.gguf    # 投影文件（自动关联）
│   │   └── _profile.json      # 可选：专属参数配置
│   └── gemma-4-26b/
│       ├── Q4_K_M.gguf
│       ├── mmproj-f16.gguf
│       └── _profile.json
├── mmprojs/               # 多模态投影文件目录（平铺模型备选）⭐
├── package.json
└── README.md
```

## 模型包系统（Model Package）⭐

从 v2.0 开始，引入 **模型包（Model Package）** 目录约定，让模型、投影文件、参数配置自动关联，无需手动编辑 `model-profiles.json`。

### 什么是模型包？

**模型包** = `models/` 下的一个子目录，包含：

```
models/qwen3.5-35b/              ← 目录名 = 模型包名称
├── Q4_K_M.gguf                  ← 模型文件（自动发现）
├── Q5_K_M.gguf                  ← 支持多个量化版本
├── mmproj-f16.gguf              ← 投影文件（自动关联到所有模型文件）
└── _profile.json                ← 可选：模型专属参数
```

### 自动发现规则

| 规则 | 说明 |
|------|------|
| **模型识别** | 目录内所有 `.gguf` 文件（文件名不含 `mmproj`） |
| **投影关联** | 文件名含 `mmproj` 的 `.gguf` 文件自动作为投影文件 |
| **配置加载** | 如果存在 `_profile.json`，自动加载其 `args` 和 `thinkingMode` |
| **多量化共享** | 一个包内所有模型文件共享同一个 mmproj 和 profile |

### 手动配置 → 自动发现

**改造前**（每次新模型都要编辑 `model-profiles.json`）：

```json
{
  "mmproj": {
    "matches": {
      "mmproj-Qwen3.5-f16.gguf": ["Qwen3.5-35B-Q4_K_M", "Qwen3.5-35B-Q5_K_M"]
    }
  },
  "profiles": {
    "qwen3.5": {
      "models": ["Qwen3.5-35B-Q4_K_M", "Qwen3.5-35B-Q5_K_M"],
      "args": { "--flash-attn": "on", "--fit": "on" },
      "thinkingMode": "reasoning-flag"
    }
  }
}
```

**改造后**（无需编辑任何配置文件）：

```
models/qwen3.5-35b/
├── Q4_K_M.gguf          ← 放进来就行
├── Q5_K_M.gguf          ← 放进来就行
├── mmproj-f16.gguf      ← 放进来就行
└── _profile.json        ← 放进来就行
```

### 新模型添加流程

1. **创建目录**：`mkdir models/qwen3.6-14b/`
2. **放入文件**：模型 `.gguf`、投影 `.gguf`、可选 `_profile.json`
3. **运行**：`gguf-run` → 自动发现，直接可用 ✅

> **无需再编辑 `model-profiles.json`！**

### 平铺模式（向后兼容）

仍然支持直接把 `.gguf` 文件放在 `models/` 根目录，使用传统的 `model-profiles.json` 配置方式。两种模式可以混合使用。

```
models/
├── qwen3.6-14b/              ← 包模式（自动发现）
│   ├── Q4_K_M.gguf
│   └── mmproj-f16.gguf
├── legacy-model.gguf         ← 平铺模式（传统方式）
└── another-model.gguf
```

### 迁移指南

将现有模型迁移到包目录：

```bash
# 例如：将 Qwen3.6 模型迁移到包目录
mkdir models/qwen3.6-35b/
mv models/Qwen3.6-35B-*.gguf models/qwen3.6-35b/
mv mmprojs/mmproj-Qwen3.6-*.gguf models/qwen3.6-35b/mmproj-f16.gguf
```

迁移后可以清理 `model-profiles.json` 中对应的 `mmproj.matches` 条目（但保留 `profiles` 段作为全局后备也无妨）。

建议迁移的模型：
- ✅ 有多量化版本的模型系列（如 Qwen3.5、Qwen3.6）
- ✅ 需要 mmproj 的多模态模型
- ✅ 需要特殊参数配置的模型（如 Gemma-4）
- ❌ 不常用的实验性模型可以保持平铺

### 配置优先级

配置文件加载顺序（高 → 低）：

1. **包内 `_profile.json`**（最高优先级，只对该包生效）
2. **全局 `model-profiles.json` 的 `profiles` 段**（对所有模型生效）
3. **系统默认值**

### llama 相关资源

- **llama.cpp GitHub**: [https://github.com/ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp)
- **官方文档**: [https://github.com/ggerganov/llama.cpp/tree/master/examples](https://github.com/ggerganov/llama.cpp/tree/master/examples)
- **llama-server 参数说明**: [https://github.com/ggerganov/llama.cpp/blob/master/tools/server/README.md](https://github.com/ggerganov/llama.cpp/blob/master/tools/server/README.md)

**注意**: 如果工具执行出错，建议查看上述链接了解最新的 llama 参数变化。

### 安装依赖

```bash
npm install
```

### 全局安装 (可选)

```bash
npm link
```

安装后可以在任意目录使用`gguf-run`命令。

## 统一入口命令 (推荐)

为了方便使用，可以使用 `gguf` 统一入口命令，支持交互菜单和快速命令两种模式。

### 交互菜单模式

```bash
# 显示交互菜单
gguf -m
# 或者
gguf
```

菜单选项：
- ▶️  启动模型服务器
- 📦 检查更新
- 📥 下载更新
- 🔄 自动更新
- ℹ️ 查看版本

### 快速命令模式

```bash
# 启动模型
gguf run

# 检查更新
gguf check

# 下载更新
gguf download

# 自动更新
gguf update

# 查看版本
gguf version
```

## llama.cpp 自动更新

### 为什么需要更新？

llama.cpp 项目更新频繁，经常有新功能和性能优化。使用 `gguf-updater` 工具可以轻松检查和更新本地的 llama.cpp 二进制文件。

### 独立命令使用

```bash
# 检查可用更新
gguf-updater check

# 查看当前版本
gguf-updater version

# 显示手动下载链接（推荐，可手动下载后解压）
gguf-updater download

# 自动更新（会提示确认）
gguf-updater update

# 静默更新（无需确认）
gguf-updater update -y
```

### 更新流程

1. **检查版本** - 从 GitHub 获取最新 release 版本
2. **对比版本** - 与本地 `.version` 文件记录的版本号对比
3. **下载安装** - 下载 CUDA 12.4 Windows x64 二进制包并解压到 `llama-cuda-12/` 目录
4. **记录版本** - 更新完成后保存新版本号

**注意**: 更新会覆盖 `llama-cuda-12/` 目录中的所有文件，请确保没有存放其他自定义文件。

### 自定义安装目录

```bash
gguf-updater check -d /path/to/your/llama-binaries
gguf-updater update -d /path/to/your/llama-binaries
```

### 下载源

默认下载 GitHub 最新 release 中的 `llama-*.zip` 文件（包含完整的 llama.cpp 二进制）。

### 代理支持

如果下载速度慢，可以配置 HTTP/HTTPS 代理。

#### 方法 1：配置代理（推荐，一次配置永久生效）

```bash
# 交互式配置代理
gguf-updater config
```

配置后会保存到配置文件，下次自动使用。

#### 方法 2：命令行临时指定

```bash
# 使用代理
gguf-updater check --proxy http://127.0.0.1:7897

# 不使用代理
gguf-updater check --no-proxy
```

#### 方法 3：环境变量（旧方法，每次需要设置）

**PowerShell:**
```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
gguf-updater download
```

**CMD:**
```cmd
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
gguf-updater download
```

## 使用方法

### 基本使用

1. 创建 `models/` 目录
2. 将 `.gguf` 模型文件放入 `models/` 目录
3. 运行工具:

```bash
node bin/gguf-run
```

或 (如果已全局安装):

```bash
gguf-run
```

### 命令行参数

```bash
gguf-run [options]

选项:
  -m, --model <file>             GGUF 模型文件
  -c, --ctx-size <size>          上下文大小 (默认："2048")
  -H, --host <host>              服务器主机 (默认："127.0.0.1")
  -p, --port <port>              服务器端口 (默认："8080")
  -T, --temp <temp>              温度 (默认："1.0")
  -P, --top-p <top-p>            Top-P 采样 (默认："0.95")
  -t, --threads <count>          线程数 (默认："6")
  -l, --llama-command <command>  Llama 命令名称 (默认："llama-server")
  -e, --extra-args <args>        额外的 llama 参数
  -j, --mmproj <file>            多模态投影文件 (.gguf)
  --enable-thinking              启用思考模式 (默认：true)
  -V, --version                  显示版本号
  -h, --help                     显示帮助信息
```

### 使用示例

#### 1.交互式运行 (推荐)  

```bash
gguf-run
```

工具会自动:
1. 扫描当前目录的.gguf 文件
2. 显示模型列表供选择
3. 引导设置参数 (显示默认值)
4. 确认后执行

#### 2.指定模型文件  

```bash
gguf-run -m model.gguf
```  
如上

#### 3.自定义参数

```bash
gguf-run -m model.gguf -c 4096 -H 0.0.0.0 -p 9000 -T 0.7 -P 0.9
```

#### 4.添加额外参数

```bash
gguf-run -e "--n-gpu-layers 35 --threads 4"
```

#### 5.完整示例

```bash
gguf-run -m qwen-7b.gguf -c 4096 -H 0.0.0.0 -p 8080 -T 0.7 -P 0.9 -l llama-server -e "--n-gpu-layers 35 --threads 8"
```

## 参数说明

### 基础参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| model | GGUF 模型文件路径 | 无 (交互式选择) |
| ctx-size | 上下文窗口大小 | 16384 |
| host | 服务器监听地址 | 127.0.0.1 |
| port | 服务器监听端口 | 8080 |
| temp | 温度参数 | 1.0 |
| top-p | Top-P 采样概率 | 0.95 |
| threads | 线程数 | 6 |
| enable-thinking | 启用思考模式 | true |
| llama-command | Llama 命令名称 | llama-server |

### 自动添加的固定参数

以下参数会自动添加到所有命令中 (针对本机使用优化):

- `-np 1`: 设置并行数为 1(本机使用)
- `--chat-template-kwargs '{"enable_thinking": false}'`: 关闭思考模式

**注意**: JSON 参数使用单引号包裹，简单明了，无需复杂转义。

### 常用额外参数

以下是常用的 llama 额外参数，可通过`-e`选项传递:

- `--n-gpu-layers <n>`: GPU 加速层数
- `--threads <n>`: 线程数
- `--batch-size <n>`: 批处理大小
- `--temp <f>`: 温度参数
- `--top-p <f>`: Top-p 采样
- `--no-mmap`: 禁用内存映射

示例:
```bash
gguf-run -e "--n-gpu-layers 35 --threads 4 --temp 0.7"
```

## 多模态支持（图像识别）

llama-server 支持多模态模型，可以识别和分析图像内容。目前支持的模型包括 **Qwen-VL 系列**、**LLaVA 系列**等视觉语言模型。

### 前置要求

1. **多模态模型文件**: 下载支持视觉的 GGUF 模型（如 `Qwen2-VL-7B-Instruct-GGUF`），放入 `models/` 目录
2. **投影文件 (mmproj)**: 对应的多模态投影文件（`.gguf` 格式），放入 `mmprojs/` 目录

> **注意**: 模型文件和 mmproj 文件需要匹配使用，通常在同一模型发布页面提供。

> ⚠️ **以前：mmproj 文件命名冲突问题（已解决）**
>
> 旧方案将所有 mmproj 文件放在全局 `mmprojs/` 目录，不同模型系列的同名文件会冲突，
> 需要手动重命名 + 编辑 `model-profiles.json` 配置映射。
>
> **✅ 新方案：使用模型包（推荐）**
>
> 将 mmproj 文件直接放在模型包目录中，无需重命名、无需配置：
>
> ```
> models/qwen3.5-35b/                  ← 模型包目录
> ├── Q4_K_M.gguf                      ← 模型文件
> ├── mmproj-f16.gguf                  ← 投影文件（包内，命名随意）
> └── _profile.json                    ← 可选：模型参数
> ```
>
> **仍然支持全局** `mmprojs/` **目录**用于平铺模型，但不推荐用于新模型。
>
> 然后在 `model-profiles.json` 配置文件中建立模型与 mmproj 的映射关系（见下文）。

### 使用步骤

#### 交互式模式

```bash
gguf-run
```

工具会自动扫描：
- `models/` 目录中的 GGUF 模型
- `mmprojs/` 目录中的投影文件

**智能匹配**: 工具会根据模型文件名自动匹配对应的 mmproj 文件（如 `Qwen3.5` 模型会自动匹配包含 `Qwen` 或 `Qwen3.5` 关键词的 mmproj 文件），并在列表中用 `⭐ (auto-matched)` 标记。如果没有找到匹配的，可以手动选择。

选择后即可启动多模态服务。

#### 命令行模式

```bash
gguf-run -m qwen2-vl-7b-instruct.gguf -j qwen2-vl-mmproj-f16.gguf -c 4096 -e "--n-gpu-layers 35"
```

- `-m`: 指定 models/ 目录中的模型文件
- `-j`: 指定 mmprojs/ 目录中的投影文件（可以是相对路径或绝对路径）

### 推荐参数

对于多模态模型，建议使用以下参数以获得更好的性能和稳定性：

```bash
gguf-run -m <model>.gguf -j <mmproj>.gguf --cache-type-k q8_0 --no-mmap
```

| 参数 | 说明 |
|------|------|
| `--cache-type-k q8_0` | 使用 8 位量化存储 KV 缓存，减少显存占用 |
| `--no-mmap` | 禁用内存映射，避免大模型加载时的内存问题 |

> 💡 **提示：Context Size**
>
> 默认 Context Size 为 `16384`，确保多模态图片解析有足够上下文空间。
>
> 对于纯文本模式，可以使用 `-c 2048` 或 `--ctx-size 2048` 降低内存占用。

### Cherry Studio 配置说明

如果你使用 **Cherry Studio** 作为前端界面，配置多模态模型时请注意：

1. **后端配置**: 在 Cherry Studio 的设置中，将后端指向 llama-server 运行的地址（如 `http://127.0.0.1:8080`）

2. **模型选择**: 确保 Cherry Studio 中选择的模型与 llama-server 启动时加载的模型一致

3. **图像上传**: Cherry Studio 支持直接上传图片，图片会被发送到 llama-server 进行处理

4. **注意事项**:
   - 确保启动 llama-server 时正确指定了 `-j` 参数加载 mmproj 文件
   - 多模态模型需要更多显存，建议预留足够的 GPU 资源
   - 部分旧版本 Cherry Studio 可能需要手动配置多模态支持
   - **图片大小限制**: 建议上传图片小于 **1MB**，过大的图片（如 >3MB）可能导致加载失败。如需分析大图，建议先压缩或调整尺寸。

### 自动匹配规则

工具会自动根据模型上下文匹配对应的 mmproj 文件和参数配置，匹配优先级：

1. **包内 mmproj** (最高优先级)：模型在包目录中时，自动使用包内的 mmproj 文件
2. **包内 _profile.json**：包目录中的 `_profile.json` 自动注入模型参数
3. **配置文件匹配**：`model-profiles.json` 中的精确映射（用于平铺模型）
4. **全局 mmprojs/ 手动选择**：无匹配时用户从全局目录手动选择

**匹配成功时**：只显示匹配的 mmproj 文件和 `None` 选项

**匹配失败时**：显示所有 mmproj 文件供用户手动选择

### 配置文件 (可选，推荐使用模型包替代)

#### 1. mmproj 映射配置

用于精确控制模型和 mmproj 的映射关系：

```json
{
  "mmproj": {
    "default": "Qwen3.5-35B-A3B-mmproj-F16.gguf",
    "matches": {
      "Qwen3.5-35B-A3B-mmproj-BF16.gguf": [
        "Qwen3.5-35B-A3B-Q4_K_M",
        "Qwen3.5-35B-A3B-Q5_K_M",
        "Qwen3.5-35B-A3B-Q8_0",
        "Unsloth-Qwen3.5-35B-A3B-Q4_K_M"
      ],
      "Qwen3.5-9B-mmproj-BF16.gguf": [
        "Qwen3.5-9B-Q4_K_M",
        "Qwen3.5-9B-Uncensored-Q4_K_M"
      ],
      "FireRed-OCR.mmproj-f16.gguf": [
        "FireRed-OCR.Q8_0"
      ]
    }
  }
}
```

**mmproj 配置说明**:

- `default`: 默认使用的 mmproj 文件（当没有其他匹配时）
- `matches`: **mmproj 文件到模型文件名列表**的精确映射关系
  - **键**：mmproj 文件名（必须是 `mmprojs/` 目录中实际存在的文件，不含路径）
  - **值**：模型文件名数组（不含 `.gguf` 扩展名），必须精确匹配

**mmproj 匹配规则**:

1. **精确匹配**：模型文件名（不含 `.gguf`）必须在配置文件的数组中完全匹配
2. **匹配成功**：只显示匹配的 mmproj 文件和 `None` 选项
3. **匹配失败**：显示所有 mmproj 文件供用户手动选择

**mmproj 匹配示例**:

| 模型文件名 | 是否匹配 | 匹配的 mmproj |
|-----------|---------|--------------|
| `Qwen3.5-35B-A3B-Q4_K_M.gguf` | ✅ 是 | `Qwen3.5-35B-A3B-mmproj-BF16.gguf` |
| `Qwen3.5-35B-A3B-Q8_0.gguf` | ✅ 是 | `Qwen3.5-35B-A3B-mmproj-BF16.gguf` |
| `Qwen3.5-9B-Q4_K_M.gguf` | ✅ 是 | `Qwen3.5-9B-mmproj-BF16.gguf` |
| `Qwen3.5-7B-Q4_K_M.gguf` | ❌ 否 | 手动选择 |

#### 2. Model Profiles 配置

用于为特定模型设置默认的 llama 运行参数（如 `--flash-attn off`、`--image-min-tokens` 等）：

```json
{
  "profiles": {
    "gemma-4-e4b-uncensored": {
      "models": [
        "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P",
        "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P"
      ],
      "args": {
        "--flash-attn": "off",
        "--fit": "off"
      }
    },
    "gemma-4-26b-uncensored": {
      "models": [
        "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M",
        "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q8_0"
      ],
      "args": {
        "--flash-attn": "off",
        "--fit": "off"
      }
    }
  }
}
```

**Profile 配置说明**:

- **key**: profile 名称（自定义，用于标识）
- **models**: 模型文件名数组（不含 `.gguf` 扩展名），精确匹配
- **args**: 该模型需要的额外参数键值对，会自动添加到 llama 命令中

**工作原理**:

1. 用户选择模型后，系统遍历 `profiles` 中的所有配置
2. 根据模型文件名进行精确匹配
3. 匹配成功后，将 `args` 中的参数自动添加到运行命令中
4. 用户无需每次手动输入这些参数

**Profile 匹配示例**:

| 模型文件名 | 是否匹配 | 自动添加的参数 |
|-----------|---------|--------------|
| `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf` | ✅ 是 | `--flash-attn off --fit off` |
| `gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf` | ✅ 是 | `--flash-attn off --fit off` |
| `Qwen3.5-35B-A3B-Q4_K_M.gguf` | ❌ 否 | 无 |

### 完整示例

```bash
# 启动 Qwen2-VL 多模态模型
gguf-run -m models/Qwen2-VL-7B-Instruct-Q4_K_M.gguf \
         -j mmprojs/mmproj-Qwen2-VL-7B-f16.gguf \
         -c 4096 \
         -p 8080 \
         -e "--cache-type-k q8_0 --no-mmap --n-gpu-layers 35"
```

启动后，可以通过 API 或 Cherry Studio 上传图片进行对话。

## 项目结构

```
gguf-runner/
├── package.json          # 项目配置
├── README.md             # 使用说明
├── bin/
│   └── gguf-run          # CLI 入口
└── src/
    ├── index.js          # 主程序 (未使用，入口在 bin/gguf-run)
    ├── scanner.js        # GGUF 文件扫描
    ├── prompts.js        # 交互式提示
    ├── builder.js        # 命令构建
    └── runner.js         # 命令执行
```

## 常见问题

### 1.找不到 models 目录

**错误信息**: `No "models" directory found or no GGUF files in models/`

**解决方法**:
- 在项目根目录创建 `models/` 目录
- 将 `.gguf` 模型文件放入 `models/` 目录中

### 2.找不到 llama 命令

**错误信息**: `llama-server command not found` 或 `llama-cli command not found`

**解决方法**:
- 确认 llama 已正确安装
- 确认 llama-server 或 llama-cli 已添加到系统 PATH 环境变量中
- 在终端运行`llama-server --version`验证
- 如果使用不同的命令名称，使用`-l`参数指定 (如`-l llama-cli`)

### 3.models 目录中没有 GGUF 文件

**错误信息**: `No GGUF files found in models/ directory`

**解决方法**:
- 确认 `models/` 目录中包含 `.gguf` 文件
- 或使用 `-m` 参数指定模型路径 (如 `-m models/model.gguf`)

### 4.端口被占用

**错误信息**: 端口占用相关错误

**解决方法**:
- 使用`-p`参数指定其他端口
- 或停止占用端口的程序

### 5.Gemma-4 模型崩溃 / 无法识别图片

**错误信息**: 程序启动后立即崩溃，或 `error: invalid argument:`，或图片识别失败

**原因**: Gemma-4 模型需要特定的参数才能正常运行图片识别功能，默认参数不兼容。

**解决方法**: 本项目已通过 `model-profiles.json` 配置文件为 Gemma-4 模型设置了正确的参数。确保配置文件中包含以下 profile：

```json
"gemma-4-26b-uncensored": {
  "models": [
    "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M",
    "gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q8_0"
  ],
  "args": {
    "--flash-attn": "on",
    "--fit": "on",
    "--jinja": "",
    "--image-min-tokens": "1120",
    "--image-max-tokens": "1120",
    "--ubatch-size": "2048",
    "--batch-size": "2048"
  },
  "thinkingMode": "reasoning-flag"
}
```

**关键参数说明**:
- `--image-min-tokens` / `--image-max-tokens`: 设置图片解析的 token 范围
- `--reasoning on`: Gemma-4 使用 reasoning 参数替代 `--chat-template-kwargs` 的 thinking 模式
- `--jinja`: 启用 Jinja 模板支持（空值标志参数）
- `thinkingMode: "reasoning-flag"`: 让代码自动使用 `--reasoning on/off` 而非 `--chat-template-kwargs`

## 技术栈

- **Commander.js**: 命令行参数解析
- **Inquirer.js**: 交互式命令行界面
- **Chalk**: 终端颜色输出
- **Node.js**: 运行环境

## 故障排查

### 参数错误

如果遇到参数相关的错误 (如 `parse error` 或 `invalid argument`),可能是 llama 版本更新导致参数变化。

**解决步骤**:
1. 查看 [llama.cpp 官方文档](https://github.com/ggerganov/llama.cpp) 了解最新参数
2. 检查 [llama-server 参数说明](https://github.com/ggerganov/llama.cpp/blob/master/tools/server/README.md) 确认参数格式
3. 在 [Issues](https://github.com/ggerganov/llama.cpp/issues) 中搜索相关问题

### 其他问题

如果遇到其他问题，可以:
1. 手动运行显示的命令进行测试
2. 查看 llama 的输出日志
3. 参考官方文档调整参数

## 推荐工作流

对于个人本地使用，推荐以下组合：

- **后端**: `llama.cpp` (llama-server) - 性能最优
- **前端**: [Cherry Studio](https://github.com/kangfenmao/cherry-studio) - 界面友好，支持多模型管理

相比 Ollama 和 LM Studio，这个组合没有中间层，速度最快，内存占用更低。

## 许可证

MIT
