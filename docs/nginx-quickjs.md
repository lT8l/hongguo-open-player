# nginx QuickJS / 任意子路径 Web 部署

本分支保留 Electron / Express 桌面端实现，同时提供无需 Node.js 常驻服务的 nginx Web 版。项目不预设网站域名或部署子路径。

## 要求

- nginx + ngx_http_js_module；njs 至少 0.9.1，以便 QuickJS 使用 ngx.fetch。
- 能访问红果官网的 DNS / 网络，以及有效的 HTTPS CA 证书链。
- Node.js 仅用于生成 nginx 配置，Web 服务实际运行时不需要 Node.js。

## 生成 nginx 配置

以下 /watch/ 仅是示例，支持根路径 / 及任何符合 URL 路径规范的子路径。运行：

~~~sh
node scripts/render-nginx-config.js \
  --prefix /watch/ \
  --resolver 127.0.0.53 \
  --ca-bundle /etc/ssl/certs/ca-certificates.crt \
  --listen 8080 \
  --server-name _ \
  > /tmp/hongguo-server.conf
~~~

配置生成器默认指向本仓库 src/client 静态文件目录以及 nginx/player.js，可传入 --client-root 与 --script 指定绝对路径。输出是 nginx 的 server 块，请放入 http 上下文，并按发行版加载 ngx_http_js_module 动态模块。自定义证书与 resolver，请勿关闭 TLS 校验。随后运行 nginx -t 和 nginx -s reload。

访问 https://你的域名/watch/，不带尾部斜杠的子路径会重定向到带斜杠形式。HTML 资源 URL 使用相对路径；客户端自动从正在运行的 js/app.js 脚本地址推导站点前缀，并请求相同前缀下的 api/，无须构建或替换代码。

## 收藏与播放记录

这两类数据均存放在浏览器 localStorage，不上传到 nginx。收藏保存剧集名称、封面、集数和更新时间；历史保存最后一集、播放秒数、已看集数和更新时间，并在切换/暂停/关闭/播放过程中自动保存。

localStorage 键名包含当前子路径，同一 origin 下不同安装目录可隔离数据。清除浏览器网站数据、换浏览器、换 origin/子路径将影响访问记录。原 Electron 版 data/user_data.json 不会自动迁移；更换部署前缀时，如需保留记录，可在浏览器开发工具中迁移对应的 localStorage 键。

## QuickJS 功能边界

Web QuickJS API 通过固定的红果官方网站读取公开搜索、目录与剧集页面；只有官网明确提供并且身份校验一致的公开完整 MP4 才可播放。转发时校验剧集、vid 和目标媒体域名。受保护视频返回明确错误，不会把官方短预览当作整集。

原桌面版的签名/解密、Range 转发、App 原生分类和演员功能使用 Node 专有依赖，本次未完整移植到 QuickJS；演员与诊断 API 返回 501。Web 目录只依赖官方公开网页，结构变更可能需要跟随更新。如果需要全部受保护视频，请保留使用 Electron 版。

## 校验

~~~sh
npm run test:unit
node --check src/client/js/app.js
node --check src/client/js/local-store.js
node --check scripts/render-nginx-config.js
node --check --input-type=module < nginx/player.js
nginx -t
~~~

nginx -t 需要在真正安装了 QuickJS 模块的目标环境执行。详见 nginx 官方的 [QuickJS 引擎](https://nginx.org/en/docs/njs/engine.html#quickjs_engine) 和 [ngx_http_js_module](https://nginx.org/en/docs/http/ngx_http_js_module.html) 文档。
