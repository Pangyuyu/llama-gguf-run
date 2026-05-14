# 命令

## Gemma-4
- 无审查模型暂时使用方式
  主要设置：--flash-attn off
```cmd
llama-server `
  -m "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q8_K_P.gguf" `
  --jinja `
  --reasoning off `
  --reasoning-budget 0 `
  -ngl 28 `
  -c 16384 `
  --flash-attn off `
  --fit off `
  --no-mmap `
  -b 512 `
  --host 0.0.0.0
  --port 8080
  --chat-template-kwargs '{"enable_thinking": true}
```

## 运行 Bonsai-8B
```cmd
llama-server `
-m Bonsai-8B.gguf `
    --host 0.0.0.0 `
    --port 8080 `
    -ngl 99
```

```cmd
./prism-llama-cuda/llama-server `
-m ./models/Bonsai-8B.gguf `
    --host 0.0.0.0 `
    --port 8080 `
    -ngl 99
```