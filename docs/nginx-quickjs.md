# nginx QuickJS / 任意子路径 Web 部署

本分支保留原 Electron / Express 桌面端，另提供 nginx + QuickJS 的 Web 部署方式。**部署及运行均不需要安装 Node.js，不需要构建或生成配置**。站点域名与安装子路径由 nginx 配置决定，前端自动从 JS 文件地址计算同源 API 基础路径。

## 环境要求

- nginx 安装并启用 `ngx_http_js_module`，njs 版本至少 **0.9.1**（QuickJS `ngx.fetch`）。
- nginx 服务器能访问官网 HTTPS；配置可用的 DNS resolver 与 TLS CA 证书。
- Web 端直接托管仓库中的 `src/client/` 文件，后端执行 `nginx/player.js`，不运行 `src/server/index.js`。
- 如 nginx 模块以动态模块安装，应在 nginx 主配置（`http {}` **之外**）加载，例如 `load_module modules/ngx_http_js_module.so;`；模块文件名与路径以发行版为准。

## 使用原生 nginx 配置文件

直接查看或复制 [`nginx/nginx.conf.example`](../nginx/nginx.conf.example) 的 `server {}` 块，放入现有 nginx 的 `http {}` 内（如 `conf.d/hongguo.conf`），按环境编辑以下内容：

1. `listen`、`server_name`：沿用现有端口、站点域名或反向代理设置；示例 `server_name _` 是通配占位配置，不绑定域名。
2. `js_import player from ...`：改成部署目录下 `nginx/player.js` 的**绝对路径**；`alias` 改成 `src/client/` 的绝对路径，并保留末尾斜杠。
3. `resolver`、`js_fetch_trusted_certificate`：改为本机可用的 DNS 和 CA 文件路径，**不要禁用 TLS 验证**。
4. 子路径：示例是 `/watch/`，可改成 `/video/`、`/apps/player/` 等。同步调整 `location = /watch` 的末尾斜杠重定向以及 `location ^~ /watch/api/` 和 `location ^~ /watch/`，确保三处使用同一个前缀。

### 根路径（/）部署

如需直接使用根路径 `https://站点域名/`，将原配置中的这三处替换为：

```nginx
# 根路径不需要 location = /watch 的重定向，删除它。
location ^~ /api/ {
    js_content player.api;
    add_header Cache-Control "no-store" always;
}

location ^~ / {
    alias /opt/hongguo/src/client/;
    index index.html;
    try_files $uri $uri/ =404;
    # 保留示例配置中的静态资源安全响应头 / CSP
}
```

上面的根路径片段只演示需要修改的位置：请保留原示例中的其他 nginx 指令（包括 `js_engine qjs`、`js_import`、`resolver`、TLS 验证和安全响应头）。

### 启用和验证

```sh
nginx -t
nginx -s reload
```

再访问 `https://站点域名/watch/`（或调整后的路径）。前端 `css/`、`js/`、`assets/` 都采用相对 URL；`js/app.js` 根据实际脚本 URL 计算 API 前缀，不需要重建、不需要改 JS，也无需 Node.js。

若站点位于另一层反向代理之后，应避免代理层意外剥离子路径，确保用户看到的 URL 与上述 `location` 匹配。部署前先用 `nginx -t` 确认配置被目标 nginx 接受。

## 浏览器本地数据

收藏和历史都保存在用户浏览器 `localStorage`，不会向 nginx 上传。收藏保存剧集 ID、名称和封面；历史保存集数、已看集数、当前播放秒数与更新时间，播放期间定时更新，并在切换剧集、暂停及关闭页面时保存。

存储键包含安装前缀：同域不同子路径的数据隔离。更换域名、子路径或浏览器，以及清除站点数据，可能导致旧数据不可见。原 Electron 版 `data/user_data.json` 不会自动迁移。

## QuickJS Web 版与 Electron 版差异

Web 版仅调用官网公开页面，提供搜索、公开目录和剧集信息；仅在来源确实给出并验证了完整公开 MP4 时进行媒体重定向。原桌面端特有的视频加密签名/解密、Range 代理及 App 专有演员接口没有移植为等效 QuickJS 功能。受保护的视频会明确失败，演员接口返回 501；不应误认所有剧集都能在 Web 端完整播放。

## 开发测试（可选）

**只有运行仓库单元测试时才需要 Node.js**。这不是部署要求：

```sh
npm run test:unit
node --check src/client/js/app.js
node --check src/client/js/local-store.js
node --check --input-type=module < nginx/player.js
```

还需要在实际安装 QuickJS 模块的 nginx 上执行 `nginx -t` 和端到端验证，单元测试不能替代真实 nginx 测试。官方参考：[QuickJS 引擎](https://nginx.org/en/docs/njs/engine.html#quickjs_engine)、[ngx_http_js_module](https://nginx.org/en/docs/http/ngx_http_js_module.html)。
