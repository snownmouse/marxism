# 小原 AI 向导 · 服务端代理

纯 Node 内置模块实现，**零依赖**，不需要 `npm install`。

## 为什么需要它

前端直连大模型会把 API Key 暴露给任何打开开发者工具的人。这一层把 Key 收进服务器环境变量，
同时给语音合成加磁盘缓存（同一句话只合成一次）。

```
浏览器 ──POST /api/chat──▶ 本服务 ──▶ 阿里通义千问（qwen-plus）
浏览器 ──POST /api/tts ──▶ 本服务 ──▶ CosyVoice（缓存到 /opt/marxism-cache/tts）
浏览器 ──GET  /api/health──▶ 本服务（自检，前端据此判断在线/本地）
```

没有配置 Key 时，两个接口返回 `503`，前端自动降级为**本地规则引导 + 浏览器语音**，页面不会白屏。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DASHSCOPE_API_KEY` | 空 | **必填**，阿里云 DashScope Key。为空则只提供降级模式 |
| `PORT` | `1960` | 监听端口（仅本机，nginx 反代） |
| `HOST` | `127.0.0.1` | 监听地址 |
| `QWEN_MODEL` | `qwen-plus` | 文本模型 |
| `COSYVOICE_MODEL` | `cosyvoice-v2` | 语音模型 |
| `COSYVOICE_VOICE` | `longxiaochun_v2` | 默认音色 |
| `TTS_CACHE_DIR` | `/opt/marxism-cache/tts` | 语音缓存目录 |
| `CHAT_TIMEOUT_MS` | `35000` | 文本超时 |
| `TTS_TIMEOUT_MS` | `45000` | 语音超时 |

## 接口

### `POST /api/chat`

```json
{
  "messages": [{ "role": "user", "content": "什么是剩余价值？" }],
  "context": { "stageName": "工业资本主义", "stageIndex": 3, "stageCount": 9 }
}
```

返回：`{ "reply": "...", "mode": "online", "model": "qwen-plus" }`

### `POST /api/tts`

```json
{ "text": "剩余价值是……", "voice": "longxiaochun_v2" }
```

成功返回 `audio/mpeg` 字节流，响应头 `X-TTS-Cache: hit|miss`。

### `GET /api/health`

```json
{ "ok": true, "chat": true, "tts": true, "chatModel": "qwen-plus", "uptimeSec": 42 }
```

`chat`/`tts` 为 `false` 表示服务端还没配 Key。

## 本地调试

```bash
DASHSCOPE_API_KEY=sk-xxx node server/index.mjs
curl -s localhost:1960/api/health
```

## 部署（Lighthouse）

```bash
# 1. 放 Key（不要提交进仓库）
sudo tee /etc/marxism-api.env >/dev/null <<'EOF'
DASHSCOPE_API_KEY=sk-xxx
EOF
sudo chmod 600 /etc/marxism-api.env

# 2. 装服务
sudo cp deploy/marxism-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now marxism-api
sudo systemctl status marxism-api --no-pager

# 3. 自检
curl -s http://127.0.0.1:1960/api/health
```

nginx 需要在 1949 的 server 块里反代 `/api/`：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:1960/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
    client_max_body_size 1m;
}
```
