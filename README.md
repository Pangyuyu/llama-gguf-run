# GGUF Runner

🦙 一个交互式的命令行工具,用于简化llama运行GGUF模型的操作流程。

## 功能特性

- ✅ 自动扫描 `models/` 目录下的GGUF模型文件
- ✅ 交互式选择模型和配置参数
- ✅ 提供智能默认值(ctx-size=2048, host=127.0.0.1, port=8080)
- ✅ 支持命令行参数覆盖默认值
- ✅ 允许添加额外的llama参数
- ✅ 实时显示命令执行过程

## 安装

### 前置要求

- Node.js v14或更高版本
- llama已安装并配置到环境变量中
- 创建 `models/` 目录并放入 `.gguf` 模型文件

### 目录结构

```
your-project/
├── bin/
│   └── gguf-run          # CLI工具
├── src/                  # 源代码
├── models/                # GGUF模型文件目录 ⭐
│   ├── model1.gguf
│   └── model2.gguf
├── package.json
└── README.md
```

### llama 相关资源

- **llama.cpp GitHub**: [https://github.com/ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp)
- **官方文档**: [https://github.com/ggerganov/llama.cpp/tree/master/examples/main](https://github.com/ggerganov/llama.cpp/tree/master/examples/main)
- **参数说明**: [https://github.com/ggerganov/llama.cpp/blob/master/examples/main/README.md](https://github.com/ggerganov/llama.cpp/blob/master/examples/main/README.md)

**注意**: 如果工具执行出错,建议查看上述链接了解最新的 llama 参数变化。

### 安装依赖

```bash
npm install
```

### 全局安装(可选)

```bash
npm link
```

安装后可以在任意目录使用`gguf-run`命令。

## 使用方法

### 基本使用

1. 创建 `models/` 目录
2. 将 `.gguf` 模型文件放入 `models/` 目录
3. 运行工具:

```bash
node bin/gguf-run
```

或(如果已全局安装):

```bash
gguf-run
```

### 命令行参数

```bash
gguf-run [options]

选项:
  -m, --model <file>             GGUF模型文件
  -c, --ctx-size <size>          上下文大小 (默认: "2048")
  -H, --host <host>              服务器主机 (默认: "127.0.0.1")
  -p, --port <port>              服务器端口 (默认: "8080")
  -l, --llama-command <command>  Llama命令名称 (默认: "llama-server")
  -e, --extra-args <args>        额外的llama参数
  -V, --version                  显示版本号
  -h, --help                     显示帮助信息
```

### 使用示例

#### 1. 交互式运行(推荐)

```bash
gguf-run
```

工具会自动:
1. 扫描当前目录的.gguf文件
2. 显示模型列表供选择
3. 引导设置参数(显示默认值)
4. 确认后执行

#### 2. 指定模型文件

```bash
gguf-run -m model.gguf
```

#### 3. 自定义参数

```bash
gguf-run -m model.gguf -c 4096 -H 0.0.0.0 -p 9000
```

#### 4. 添加额外参数

```bash
gguf-run -e "--n-gpu-layers 35 --threads 4"
```

#### 5. 完整示例

```bash
gguf-run -m qwen-7b.gguf -c 4096 -H 0.0.0.0 -p 8080 -l llama-server -e "--n-gpu-layers 35 --threads 8"
```

## 参数说明

### 基础参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| model | GGUF模型文件路径 | 无(交互式选择) |
| ctx-size | 上下文窗口大小 | 2048 |
| host | 服务器监听地址 | 127.0.0.1 |
| port | 服务器监听端口 | 8080 |
| llama-command | Llama命令名称 | llama-server |

### 自动添加的固定参数

以下参数会自动添加到所有命令中(针对本机使用优化):

- `-np 1`: 设置并行数为1(本机使用)
- `--chat-template-kwargs '{"enable_thinking": false}'`: 关闭思考模式

**注意**: JSON参数使用单引号包裹,简单明了,无需复杂转义。

### 常用额外参数

以下是常用的llama额外参数,可通过`-e`选项传递:

- `--n-gpu-layers <n>`: GPU加速层数
- `--threads <n>`: 线程数
- `--batch-size <n>`: 批处理大小
- `--temp <f>`: 温度参数
- `--top-p <f>`: Top-p采样
- `--no-mmap`: 禁用内存映射

示例:
```bash
gguf-run -e "--n-gpu-layers 35 --threads 4 --temp 0.7"
```

## 项目结构

```
gguf-runner/
├── package.json          # 项目配置
├── README.md             # 使用说明
├── bin/
│   └── gguf-run          # CLI入口
└── src/
    ├── index.js          # 主程序(未使用,入口在bin/gguf-run)
    ├── scanner.js        # GGUF文件扫描
    ├── prompts.js        # 交互式提示
    ├── builder.js        # 命令构建
    └── runner.js         # 命令执行
```

## 常见问题

### 1. 找不到models目录

**错误信息**: `No "models" directory found or no GGUF files in models/`

**解决方法**:
- 在项目根目录创建 `models/` 目录
- 将 `.gguf` 模型文件放入 `models/` 目录中

### 2. 找不到llama命令

**错误信息**: `llama-server command not found` 或 `llama-cli command not found`

**解决方法**: 
- 确认llama已正确安装
- 确认llama-server或llama-cli已添加到系统PATH环境变量中
- 在终端运行`llama-server --version`验证
- 如果使用不同的命令名称,使用`-l`参数指定(如`-l llama-cli`)

### 3. models目录中没有GGUF文件

**错误信息**: `No GGUF files found in models/ directory`

**解决方法**:
- 确认 `models/` 目录中包含 `.gguf` 文件
- 或使用 `-m` 参数指定模型路径(如 `-m models/model.gguf`)

### 4. 端口被占用

### 3. 端口被占用

**错误信息**: 端口占用相关错误

**解决方法**:
- 使用`-p`参数指定其他端口
- 或停止占用端口的程序

## 技术栈

- **Commander.js**: 命令行参数解析
- **Inquirer.js**: 交互式命令行界面
- **Chalk**: 终端颜色输出
- **Node.js**: 运行环境

## 故障排查

### 参数错误

如果遇到参数相关的错误(如 `parse error` 或 `invalid argument`),可能是 llama 版本更新导致参数变化。

**解决步骤**:
1. 查看 [llama.cpp 官方文档](https://github.com/ggerganov/llama.cpp) 了解最新参数
2. 检查 [参数说明](https://github.com/ggerganov/llama.cpp/blob/master/examples/main/README.md) 确认参数格式
3. 在 [Issues](https://github.com/ggerganov/llama.cpp/issues) 中搜索相关问题

### 其他问题

如果遇到其他问题,可以:
1. 手动运行显示的命令进行测试
2. 查看 llama 的输出日志
3. 参考官方文档调整参数

## 许可证

MIT
