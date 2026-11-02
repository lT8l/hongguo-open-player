# 红果开源播放器 (Hongguo Open Player) 跨平台桌面架构与工程质量审查报告

> **审查基准**：Git `main` 分支最新提交  
> **审查领域**：Electron 桌面主进程架构、macOS / Windows 跨平台系统融合度、持久化存储与文件系统兼容性、打包工程化与 CI/CD 流水线  
> **报告生成时间**：2026-10-28  
> **审查架构师**：资深桌面应用架构师（Electron / macOS & Windows 系统级开发）

---

## 1. 架构总览与健壮性评分

### 1.1 总体架构评价
红果开源播放器在架构设计上采用了 **“轻量内嵌 Express 核心引擎 + Chromium 原生窗口渲染 + 纯前端解耦交互”** 的经典桌面应用形态。整体代码干净利落，无原生 C/C++ 动态编译依赖（node-gyp），天然具备优良的跨平台交叉编译基础与轻量化优势。内置的 MP4 CENC 实时流式解密代理与 HTTP Range 分片并发加速机制在功能验证层表现优异。

然而，从**资深跨平台桌面工程标准（macOS + Windows 生产级交付）**的视角审视，当前项目在**系统级融合度、Windows 平台特异性适配、进程生命周期竞态防护、存储耐久性与发布工程化**方面仍存在若干关键隐患与架构债务。

### 1.2 架构健壮性评分

$$\mathbf{综合架构健壮性评分：82 \ / \ 100}$$

```
[维度得分分布]
┌───────────────────────────────────────────────┬───────┬──────┐
│ 评估维度                                       │ 权重  │ 得分 │
├───────────────────────────────────────────────┼───────┼──────┤
│ 1. Electron 主进程生命周期与稳定性             │ 25%   │  80  │
│ 2. macOS / Windows 跨平台系统融合度与硬件解码  │ 25%   │  78  │
│ 3. 持久化存储与跨平台文件系统兼容性           │ 25%   │  82  │
│ 4. 打包工程化与 CI/CD 流水线健壮性             │ 25%   │  88  │
└───────────────────────────────────────────────┴───────┴──────┘
```

---

## 2. 跨平台兼容性隐患与架构债务清单 (Risk & Debt Matrix)

| 严重级别 | 编号 | 缺陷 / 架构债务描述 | 影响文件与位置 | 核心风险 |
| :--- | :--- | :--- | :--- | :--- |
| **Critical** | **CRIT-01** | **打包文件白名单遗漏 Windows 窗口图标资源**，导致打包后运行时图标丢失 | [`package.json#L102-L105`](file:///Users/zfdang/workspaces/hongguo-open-player/package.json#L102-L105)<br>[`src/electron/main.js#L47`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L47) | Windows 安装版与免安装版打包运行后，窗口与任务栏图标回退为空白或默认图标 |
| **High** | **HIGH-01** | **Windows 标题栏视觉与交互割裂**（双标题栏现象、缺少 Window Controls Overlay 现代化融合适配） | [`src/electron/main.js#L25-L48`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L25-L48)<br>[`src/client/css/app.css#L40-L67`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/css/app.css#L40-L67) | Windows 用户看到系统边框与前端顶栏重叠，浪费竖屏观影纵向空间，且拖拽与双击最大化交互别扭 |
| **High** | **HIGH-02** | **数据持久化原子写入在 Windows 下存在文件锁（EPERM/EBUSY）隐患，且固定临时文件名存在写竞争与损坏无备份覆盖风险** | [`src/server/services/storeService.js#L38-L48`](file:///Users/zfdang/workspaces/hongguo-open-player/src/server/services/storeService.js#L38-L48)<br>[`src/server/services/storeService.js#L16-L36`](file:///Users/zfdang/workspaces/hongguo-open-player/src/server/services/storeService.js#L16-L36) | 高频写进度并发碰撞；Windows Defender 锁定导致重命名失败；损坏的 JSON 导致所有历史与收藏被静默抹除 |
| **High** | **HIGH-03** | **CI/CD 发布流水线触发策略过度激进**：每次向 `main` 分支 push 均触发全平台打包并发布正式 GitHub Release | [`.github/workflows/build-release.yml#L4-L9`](file:///Users/zfdang/workspaces/hongguo-open-player/.github/workflows/build-release.yml#L4-L9)<br>[`.github/workflows/build-release.yml#L31-L38`](file:///Users/zfdang/workspaces/hongguo-open-player/.github/workflows/build-release.yml#L31-L38) | 严重消耗 GitHub Actions Runner 额度（尤其是昂贵的 macOS Runner），污染 Release 历史，缺少版本准入把关 |
| **Medium** | **MED-01** | **主进程 `createWindow` 异步可重入竞争风险**，以及内嵌服务启动失败时的**静默黑屏与无弹窗报错** | [`src/electron/main.js#L14-L22`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L14-L22)<br>[`src/electron/main.js#L162-L170`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L162-L170) | 快速多次点击 Dock/任务栏导致创建多个孤立窗口；端口或网络堆栈异常时无 GUI 提示，用户以为应用闪退 |
| **Medium** | **MED-02** | **内嵌 Express 服务的生命周期关闭未终止长连接**（Socket Leak 与异步退出挂起） | [`src/electron/main.js#L180-L184`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L180-L184) | 退出时由于流媒体视频 Range 分片与 keep-alive 连接未强制切断，导致 Node 进程退出拖泥带水或异常终止 |
| **Medium** | **MED-03** | **系统原生菜单在 Windows 平台严重残缺**（缺失“文件”菜单、缺失“退出”项、帮助菜单缺失“关于”） | [`src/electron/main.js#L69-L146`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L69-L146) | 违背 Windows 桌面应用基本人机交互规范（HIG），按 Alt 激活菜单栏体验残缺 |
| **Medium** | **MED-04** | **硬件加速与 HEVC 解码在 Windows 下缺乏降级兜底诊断**，且未监听 Chromium GPU 进程崩溃 | [`src/electron/main.js#L5-L9`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L5-L9)<br>[`src/client/js/app.js#L396-L408`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/js/app.js#L396-L408) | Windows 用户未安装系统级 HEVC 解码器或双显卡驱动故障时，仅提示模糊的“解密失败”，排查成本极高 |
| **Low** | **LOW-01** | **未接入系统级媒体传输控制（Media Session API / SMTC）** | [`src/client/js/app.js#L457-L485`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/js/app.js#L457-L485) | 无法使用键盘多媒体控制键（播放/暂停/下一曲），macOS 控制中心与 Windows 音量控制悬浮条无剧集信息 |
| **Low** | **LOW-02** | **平台类名判定未区分 Electron 与普通浏览器环境**，普通浏览器访问左侧留白 | [`src/client/js/app.js#L5-L7`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/js/app.js#L5-L7)<br>[`src/client/css/app.css#L56-L58`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/css/app.css#L56-L58) | 在 Mac 浏览器打开 `http://127.0.0.1:8899` 时出现 76px 幽灵空白；Linux 桌面被识别为 win |

---

## 3. 详细架构剖析与技术审查

### 3.1 Electron 主进程生命周期与稳定性深度审查

#### 3.1.1 单实例锁定（Single Instance Lock）健壮性
在 [`src/electron/main.js#L149-L159`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L149-L159) 中：
```javascript
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  ...
```
- **Windows 窗口激活不彻底**：在 Windows 操作系统中，若窗口处于后台或未处于最小化状态（例如被其他全屏/最大化窗口遮挡），仅调用 `mainWindow.focus()` 往往无法突破 Windows 系统的前台锁定限制（Foreground Lockout）。标准实践应显式调用 `if (!mainWindow.isVisible()) mainWindow.show();` 并通过 `mainWindow.setAlwaysOnTop(true); mainWindow.show(); mainWindow.setAlwaysOnTop(false);` 或直接先 `restore()` 再 `focus()`。
- **启动阶段事件丢失竞态**：若用户双击了两次快捷方式，第二个实例启动并发射 `second-instance` 事件时，如果第一个实例正处于 `await serverStart` 的异步挂起阶段，此时 `mainWindow` 仍为 `null`，导致该次聚焦请求被彻底吞噬。
- **命令行参数被丢弃**：`second-instance` 回调函数签名提供了 `(event, commandLine, workingDirectory, additionalData)`，当前代码未提取 `commandLine`。若未来支持自定义协议唤起（如 `hongguo://play?series_id=...`）或文件关联，参数将直接丢失。

#### 3.1.2 异步创建窗口的可重入（Re-entrancy）与多窗口防抖
在 [`src/electron/main.js#L14-L22`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L14-L22) 与 [`#L166-L170`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L166-L170) 中：
```javascript
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(console.error);
  }
});
```
由于 `createWindow` 是 `async` 函数，在启动本地 Express 服务（`await serverStart`）及 `window.loadURL` 之前，`BrowserWindow.getAllWindows().length` 依然为 0。在 macOS 下，若用户快速连续点击 Dock 栏图标，将触发两次并发的 `createWindow()` 执行。
此时第二个调用会创建新的 `BrowserWindow` 实例，并将全局 `mainWindow` 变量覆盖，导致前一个窗口失去引用成为内存孤儿窗口，产生多实例视觉闪烁与混乱。

#### 3.1.3 服务启动失败与错误兜底
目前若内嵌 Express 服务启动遇到致命错误（如安全软件拦截、动态端口分配耗尽、内部初始化异常）：
`createWindow().catch((err) => { console.error('Failed to create window:', err); });`
在以 GUI 模式打包分发的桌面端二进制程序中，`console.error` 输出被直接重定向至黑洞或静默丢弃。用户双击应用后，应用无任何界面展示，亦无任何错误弹窗，表现为“闪退”或“假死”。必须采用 `dialog.showErrorBox()` 进行系统级错误回退展示并优雅终止。

#### 3.1.4 服务生命周期与退出连接泄漏
在 [`src/electron/main.js#L180-L184`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L180-L184) 中：
```javascript
app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
  }
});
```
Node.js 原生 HTTP 模块中，`server.close()` 仅停止接收新的 TCP 连接，但**不会中断已经建立的活动连接**。
由于播放器内部大量使用 HTTP 206 Range 分片流式长连接以及客户端持续轮询/预加载长连接，单纯调用 `close()` 将导致连接等待自然超时。在 Node.js 18.2.0+ 环境中，必须配合调用 `server.closeAllConnections()` 或 `server.closeIdleConnections()`，确保流媒体和网络套接字即刻彻底释放。

---

### 3.2 跨平台（macOS / Windows）适配一致性与系统融合度审查

#### 3.2.1 窗口样式与标题栏融合设计审查
- **macOS 实现评价（优良）**：
  macOS 平台采用了 `titleBarStyle: 'hiddenInset'` 与 `trafficLightPosition: { x: 16, y: 16 }`，前端通过 `html.platform-mac .app-header { padding-left: 76px; }` 留出红绿灯胶囊边距，搭配 `-webkit-app-region: drag`，呈现出非常高级的沉浸式暗黑视效。
- **Windows 实现评价（严重缺陷）**：
  当前 Windows 平台未设置 `titleBarStyle`，沿用了操作系统原生标题栏。
  这引发了经典的**“双层标题栏”（Double Title Bar）**视觉缺陷：
  1. 上层为 Windows 系统原生标准标题栏（带有应用标题和系统最小化/最大化/关闭按钮）；
  2. 下层紧接着是网页端自身的 `.app-header`（60px 高度，带有剧场 Logo、导航 Tab 和搜索框）。
  3. 更严重的是，`.app-header` 被声明了 `-webkit-app-region: drag;`。在 Windows 原生标题栏下方又出现一个可以拖拽窗口的区域，且双击该区域无法像原生标题栏一样自适应最大化/还原，甚至阻断了 Windows 11 的 Snap Layouts（贴靠布局）原生悬浮体验。

**桌面级推荐解法：采用现代 Window Controls Overlay (WCO)**
自 Electron 20+ 起，Windows 端推荐使用 `titleBarStyle: 'hidden'` 配合 `titleBarOverlay`：
```javascript
titleBarStyle: 'hidden',
titleBarOverlay: {
  color: '#14171f',
  symbolColor: '#f3f4f6',
  height: 48
}
```
这样既消除了系统冗余标题栏，又完美保留了 Windows 11 的原生最小化、最大化/Snap Layouts 及关闭按钮，使应用完全达到顶级原生现代 Windows 应用的水准。

#### 3.2.2 系统菜单栏（Application Menu）跨平台规范对齐
审查 [`src/electron/main.js#L69-L146`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L69-L146) 的菜单配置发现严重的平台不对称：
1. **Windows 缺失“文件”顶级菜单**：在 Windows 人机交互规范中，所有带菜单栏的桌面应用均必须包含“文件 (File)”菜单。
2. **Windows 缺失“退出”命令**：代码中仅在 `isMac` 为 true 时注入应用菜单包含 `quit`，Windows 下当用户按 `Alt` 呼出菜单时，整个菜单体系中找不到任何退出应用的操作项！
3. **“关于”信息丢失**：macOS 下有 `role: 'about'`，但在 Windows 下被直接排除了，Windows 下的“帮助”菜单中只有 GitHub 链接，缺少标准的关于信息对话框。

#### 3.2.3 硬件加速与 HEVC 解码管线（VideoToolbox vs D3D11VA）
主进程预注入参数：
```javascript
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,PlatformHEVCEncoderSupport');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
```
- **macOS 端**：Apple Silicon (M1/M2/M3/M4) 及近 10 年 Intel Mac 的 GPU 固件均内建完善的 VideoToolbox HEVC (H.265 Main Profile) 硬件解码单元，开启上述开关后，Chromium 能够实现 0% CPU 占用的超低功耗硬解。
- **Windows 端**：
  Windows 端 Chromium 的 HEVC 硬解依赖 **DirectX 11 / D3D11VA (D3D11 Video Acceleration)** 或 Media Foundation 接口。在 Windows 环境下存在两大客观制约：
  1. 部分较旧的 Windows 10 系统未预装微软官方商店的 **“HEVC 视频扩展 (HEVC Video Extensions)”**；
  2. 部分双显卡笔记本（核显 + 独显）在 Chromium GPU 进程切换时，可能触发驱动级 D3D11 崩溃。
- **缺乏 GPU 进程崩溃监控**：
  若 Windows 显卡驱动在视频硬解时崩溃，Chromium 会销毁 GPU 进程。当前 `main.js` 未监听 `app.on('child-process-gone')`，一旦 GPU 进程不可用，视频将黑屏且前端无法获知根本原因。

---

### 3.3 持久化存储与文件系统兼容性审查

审查 [`src/server/services/storeService.js`](file:///Users/zfdang/workspaces/hongguo-open-player/src/server/services/storeService.js)：

#### 3.3.1 跨平台路径与初始化时机
在 `storeService.js` 中：
```javascript
constructor(dataDir = process.env.HONGGUO_DATA_DIR || path.join(__dirname, '../../../data')) {
  this.dataDir = dataDir;
  this.dataFile = path.join(this.dataDir, 'user_data.json');
```
而在 `main.js` 中：
```javascript
async function createWindow() {
  process.env.HONGGUO_DATA_DIR = path.join(app.getPath('userData'), 'data');
  const { startServer } = require('../server/index.js');
```
- **环境变量注入时机过晚**：`process.env.HONGGUO_DATA_DIR` 的设置被放在了 `createWindow` 内部。如果在主进程启动时有任何模块在顶部提前 `require` 了 `storeService`（例如用于状态预热或迁移），由于此时 `process.env.HONGGUO_DATA_DIR` 为 `undefined`，`StoreService` 将回退到 `../../../data`。在打包后的只读 ASAR 环境中，向该路径写入将直接抛出 `EROFS: read-only file system` 异常崩溃。
- **开发与打包环境 userData 隔离差异**：在 `main.js` 中未显式执行 `app.setName('红果开源播放器')`。在未打包的开发环境执行 `electron .` 时，`app.getPath('userData')` 的目录名可能为 `Electron` 或 `hongguo-open-player`，而打包后为 `红果开源播放器`，导致开发与生产的数据无法平滑共享。

#### 3.3.2 原子写入在 Windows NTFS 下的锁冲突隐患
查看 `storeService.js#L38-L48`：
```javascript
save(nextState) {
  fs.mkdirSync(this.dataDir, { recursive: true });
  const tempFile = `${this.dataFile}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(nextState, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, this.dataFile);
    this.state = nextState;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}
```
存在三个严重隐患：
1. **静态临时文件名并发碰撞**：临时文件名固定为 `user_data.json.tmp`。前端每隔 4 秒定时静默保存播放进度，若用户在切集或收藏的同时触发定时保存，两笔并发请求将向同一个 `.tmp` 文件写入并重命名，发生写入竞争截断。
2. **Windows 特有的 `fs.renameSync` EPERM 锁定故障**：
   在 POSIX (macOS/Linux) 系统中，`rename` 是标准内核级原子覆写。但在 Windows (Win32) 系统中，底层的 `MoveFileExW` 在目标文件被杀毒软件（Windows Defender）、搜索索引服务（Windows Search Indexer）或同步盘短时间加锁读取时，会抛出 `EPERM` 或 `EBUSY` 错误！这是 Node.js 在 Windows 平台上的经典系统级陷阱。生产级桌面应用必须针对 `EPERM` / `EBUSY` 进行微秒级指数退避重试。
3. **无 `fsync` 导致的断电 0 字节风险**：
   `fs.writeFileSync` 仅写入操作系统页缓存（Page Cache）。若系统发生断电、蓝屏或强制关机，元数据已更新但实际数据未刷盘，可能产生 0 字节的空文件。
4. **损坏自毁风险（缺少备份容灾）**：
   在 `init()` 阶段，若 `JSON.parse` 失败，仅打印 warning，并将内存状态置空。当下一次用户触发任何收藏或进度更新时，`save()` 会直接将空的内存状态写入磁盘，导致用户以往全部的播放历史和收藏被**永久性覆盖抹除**！

---

### 3.4 打包工程化与 CI/CD 流水线审查

#### 3.4.1 打包资源漏配缺陷（Critical）
审查 [`package.json#L102-L105`](file:///Users/zfdang/workspaces/hongguo-open-player/package.json#L102-L105)：
```json
"files": [
  "src/**/*",
  "package.json"
]
```
对比 [`src/electron/main.js#L47`](file:///Users/zfdang/workspaces/hongguo-open-player/src/electron/main.js#L47)：
```javascript
// Windows 平台专属配置
windowOptions.icon = path.join(__dirname, '../../build/icon.ico');
```
在打包状态下，代码执行于 `app.asar/src/electron/main.js`。代码尝试寻找 `../../build/icon.ico`（即 `app.asar/build/icon.ico`）。
但是，`package.json` 的 `files` 白名单中**仅仅包含了 `src/**/*` 和 `package.json`，根本没有包含 `build/icon.ico`！**
这意味着打包出来的 Windows 安装包和便携版在运行时，该图标文件根本不存在，导致 Windows 原生窗口和任务栏无法加载专用高分辨率图标，回退为系统默认无图标或占位符！

#### 3.4.2 NSIS 安装包与 Portable 便携版配置
在 `package.json` 中配置了：
```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "红果开源播放器"
}
```
配置质量总体良好，允许用户自定义安装路径并在桌面和开始菜单创建中文快捷方式。建议补充 `perMachine: false`（默认安装至当前用户目录，免去 Windows UAC 提权干扰）以及 `artifactName` 规范化命名模板。

#### 3.4.3 macOS 代码签名与 Gatekeeper 隔离限制
在 `package.json` 中配置了：
```json
"mac": {
  "identity": null,
  "hardenedRuntime": false,
  "gatekeeperAssess": false
}
```
在 macOS Sonoma (14.x) 及 macOS Sequoia (15.x) 中，苹果大幅收紧了未签名软件的限制。用户从浏览器下载未签名的 DMG/ZIP 后，操作系统会自动附加上 `com.apple.quarantine` 扩展属性，用户双击打开会提示“已损坏，无法打开”或拒绝运行。
虽然开源免费软件通常不具备年度 \$99 的 Apple Developer 证书，但必须在项目 README 及发布 Release 说明中显式标注隔离属性移除指令：
`xattr -cr /Applications/红果开源播放器.app`

#### 3.4.4 GitHub Actions CI/CD 流水线健壮性审查
审查 [`.github/workflows/build-release.yml`](file:///Users/zfdang/workspaces/hongguo-open-player/.github/workflows/build-release.yml)：
```yaml
on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:
```
- **严重的发布流程污染隐患（High）**：
  工作流被配置为只要向 `main` 分支执行 `push`，就会自动执行 `prep` -> `build` -> `release`，自动生成形如 `v1.0.12` 的 Tag 并直接发布 GitHub Release！
  这在工程实践中是非常危险的：
  1. 任何日常微小提交（修注释、改文档）合并进 `main` 都会触发极其耗时的多平台完整打包；
  2. GitHub Actions 赠送的 macOS runner 分钟数极为珍贵（计费权重为 Linux 的 10 倍），频繁触发会导致账户额度迅速耗尽；
  3. Release 页面将被大量的日常提交垃圾版本淹没。
  **标准流水线规范**：向 `main` 分支 push 仅应运行 `ci.yml`（自动化测试与代码校验），而打包发布工作流 `build-release.yml` 应当**严格限制仅在推送 `v*` 语义化版本 Tag 或通过 `workflow_dispatch` 手动触发时执行**。

---

## 4. Windows 与 macOS 差异化处理的具体改进建议与代码示例

针对上述审查发现的所有关键缺陷，以下提供达到生产级质量的重构代码范式：

### 4.1 核心改进一：主进程生命周期与 WCO 跨平台窗口设计重构

**目标文件**：`src/electron/main.js`

```javascript
// SPDX-License-Identifier: GPL-3.0-only
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

// 1. 在主进程最顶层尽早初始化跨平台数据路径与 App 标识
app.setName('红果开源播放器');
const defaultUserData = app.getPath('userData');
process.env.HONGGUO_DATA_DIR = process.env.HONGGUO_DATA_DIR || path.join(defaultUserData, 'data');

// 2. 注入 Chromium 跨平台硬件加速与 HEVC 解码开关
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,PlatformHEVCEncoderSupport');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;
let serverInstance = null;
let serverStartPromise = null;
let isCreatingWindow = false; // 防止 activate 异步重入锁

// 3. 跨平台窗口创建逻辑
async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }
  if (isCreatingWindow) return null;
  isCreatingWindow = true;

  try {
    // 启动本地内嵌 Node Express 引擎（单例 Promise 保证只启动一次）
    const { startServer } = require('../server/index.js');
    if (!serverStartPromise) {
      serverStartPromise = startServer(8899).catch((err) => {
        serverStartPromise = null;
        throw err;
      });
    }
    const res = await serverStartPromise;
    serverInstance = res.server;
    const port = res.port;

    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    const windowOptions = {
      width: 1280,
      height: 840,
      minWidth: 960,
      minHeight: 640,
      title: '红果开源播放器',
      backgroundColor: '#0f1015',
      autoHideMenuBar: !isMac,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        devTools: true
      },
      show: false
    };

    // 跨平台标题栏与原生系统融合配置
    if (isMac) {
      windowOptions.titleBarStyle = 'hiddenInset';
      windowOptions.trafficLightPosition = { x: 16, y: 16 };
    } else if (isWin) {
      // Windows 现代 Window Controls Overlay 融合一体化标题栏
      windowOptions.titleBarStyle = 'hidden';
      windowOptions.titleBarOverlay = {
        color: '#14171f',
        symbolColor: '#f3f4f6',
        height: 44
      };
      // 修复打包后正确的图标路径
      windowOptions.icon = app.isPackaged
        ? path.join(process.resourcesPath, 'build/icon.ico')
        : path.join(__dirname, '../../build/icon.ico');
    }

    const window = new BrowserWindow(windowOptions);
    mainWindow = window;

    const appUrl = `http://127.0.0.1:${port}`;
    window.once('ready-to-show', () => {
      window.show();
      window.focus();
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url).catch(console.error);
      return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== appUrl) event.preventDefault();
    });

    window.on('closed', () => {
      if (mainWindow === window) mainWindow = null;
    });

    await window.loadURL(appUrl);
    return window;
  } catch (err) {
    dialog.showErrorBox(
      '播放器服务启动失败',
      `无法启动本地流媒体代理引擎：\n${err.message}\n\n请检查端口 8899 是否被安全软件占用或赋予播放器本地网络回环权限。`
    );
    app.quit();
  } finally {
    isCreatingWindow = false;
  }
}

// 4. 严格对齐 Windows 与 macOS 规范的原生菜单栏
function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: '红果开源播放器',
            submenu: [
              { role: 'about', label: '关于 红果开源播放器' },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 红果开源播放器' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 红果开源播放器' }
            ]
          }
        ]
      : [
          // Windows 规范：必须具备“文件”与“退出”
          {
            label: '文件',
            submenu: [
              {
                label: '退出',
                accelerator: 'Alt+F4',
                click: () => app.quit()
              }
            ]
          }
        ]),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '前置全部窗口' },
              { type: 'separator' },
              { role: 'window', label: '窗口' }
            ]
          : [{ role: 'close', label: '关闭' }])
      ]
    },
    {
      label: '帮助',
      submenu: [
        ...(!isMac
          ? [
              {
                label: '关于 红果开源播放器',
                click: () => {
                  dialog.showMessageBox({
                    type: 'info',
                    title: '关于',
                    message: '红果开源播放器',
                    detail: `版本: ${app.getVersion()}\n纯净原生跨平台桌面短剧播放客户端\n支持 macOS 与 Windows 原生硬解与实时流式解密。`
                  });
                }
              },
              { type: 'separator' }
            ]
          : []),
        {
          label: 'GitHub 项目主页',
          click: async () => {
            await shell.openExternal('https://github.com/zfdang/hongguo-open-player');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 5. 单实例保护与第二实例唤起参数处理
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow().catch(console.error);
    }
  });

  // 监听 GPU 进程意外崩溃
  app.on('child-process-gone', (event, details) => {
    if (details.type === 'GPU') {
      console.warn('[Electron] GPU 进程异常崩溃:', details.reason);
    }
  });

  app.whenReady().then(() => {
    setupMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // 优雅切断内嵌服务与所有活动的长连接
  app.on('before-quit', () => {
    if (serverInstance) {
      if (typeof serverInstance.closeAllConnections === 'function') {
        serverInstance.closeAllConnections();
      }
      serverInstance.close();
    }
  });
}
```

---

### 4.2 核心改进二：持久化存储原子写入与防锁死/防损坏机制

**目标文件**：`src/server/services/storeService.js`

针对 Windows 的 `fs.renameSync` EPERM 锁定问题，引入**毫秒级重试退避机制**；生成带随机数的唯一临时文件，防止并发写竞争；在写入磁盘时同步生成 `.bak` 备份文件，并提供损坏自动恢复与隔离策略：

```javascript
// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = require('path');

class StoreService {
  constructor(dataDir = process.env.HONGGUO_DATA_DIR || path.join(__dirname, '../../../data')) {
    this.dataDir = dataDir;
    this.dataFile = path.join(this.dataDir, 'user_data.json');
    this.backupFile = path.join(this.dataDir, 'user_data.json.bak');
    this.state = {
      history: Object.create(null),
      favorites: Object.create(null)
    };
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      let parsed = null;
      // 优先从主数据文件读取
      if (fs.existsSync(this.dataFile)) {
        try {
          const raw = fs.readFileSync(this.dataFile, 'utf8');
          parsed = JSON.parse(raw);
        } catch (readErr) {
          console.error('[StoreService] 主数据文件损坏，尝试从备份恢复:', readErr.message);
          // 隔离已损坏的文件，防止覆盖丢失分析线索
          const corruptArchive = path.join(this.dataDir, `user_data.corrupted.${Date.now()}.json`);
          try { fs.copyFileSync(this.dataFile, corruptArchive); } catch (_) {}
        }
      }

      // 若主文件损坏或不存在，尝试从 .bak 恢复
      if (!parsed && fs.existsSync(this.backupFile)) {
        try {
          const rawBak = fs.readFileSync(this.backupFile, 'utf8');
          parsed = JSON.parse(rawBak);
          console.log('[StoreService] 成功从备份文件恢复用户数据！');
        } catch (bakErr) {
          console.error('[StoreService] 备份文件亦不可用:', bakErr.message);
        }
      }

      if (parsed && typeof parsed === 'object') {
        for (const field of ['history', 'favorites']) {
          const entries = parsed[field];
          if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
            this.state[field] = Object.assign(Object.create(null), entries);
          }
        }
      }
    } catch (e) {
      console.warn('[StoreService] 读取用户本地数据发生未捕获异常:', e.message);
    }
  }

  /**
   * 跨平台安全的原子重命名（针对 Windows EPERM / EBUSY 的重试机制）
   */
  atomicRenameSync(src, dest, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        fs.renameSync(src, dest);
        return;
      } catch (err) {
        if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < maxRetries - 1) {
          // Windows 下短暂让出事件循环或微延迟（阻塞 15ms 后重试）
          const end = Date.now() + 15;
          while (Date.now() < end) {}
          continue;
        }
        throw err;
      }
    }
  }

  save(nextState) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    // 使用唯一的临时文件名前缀，彻底规避并发竞争覆写
    const tempFile = path.join(
      this.dataDir,
      `.user_data.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    );

    try {
      const payload = JSON.stringify(nextState, null, 2);
      // 写入并确保落盘 (fsync)
      const fd = fs.openSync(tempFile, 'w', 0o600);
      try {
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      // 如果当前存在旧主文件，先复制备份为 .bak，确保容灾链路存在
      if (fs.existsSync(this.dataFile)) {
        try {
          fs.copyFileSync(this.dataFile, this.backupFile);
        } catch (_) {}
      }

      // 跨平台安全原子替换
      this.atomicRenameSync(tempFile, this.dataFile);
      this.state = nextState;
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (_) {}
      }
    }
  }

  // 其余业务校验方法 (validateSeries, updateProgress 等) 保持原有高标准逻辑不变...
```

---

### 4.3 核心改进三：前端适配 Windows WCO 标题栏与系统级媒体控制（SMTC）

#### 4.3.1 CSS 适配 Window Controls Overlay
在 [`src/client/css/app.css`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/css/app.css) 中：
```css
/* 顶部导航条 */
.app-header {
  height: 60px;
  background-color: rgba(20, 23, 31, 0.9);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 100;
}

/* 仅在 Electron 桌面环境下启用顶栏拖拽 */
html.is-electron .app-header {
  -webkit-app-region: drag;
}

/* macOS 原生模式：左侧为红绿灯留出空间 */
html.is-electron.platform-mac .app-header {
  padding-left: 76px;
}

/* Windows WCO 原生模式：右侧为系统原生最小化/最大化/关闭按钮留出安全区域 */
html.is-electron.platform-win .app-header {
  padding-right: 144px;
}
```

#### 4.3.2 前端精准环境识别与 Media Session 接入
在 [`src/client/js/app.js`](file:///Users/zfdang/workspaces/hongguo-open-player/src/client/js/app.js) 初始化阶段：
```javascript
// 准确识别是否运行在 Electron 原生容器中以及所属宿主 OS
const isElectron = /Electron/i.test(navigator.userAgent);
const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
const rootCls = document.documentElement.classList;

if (isElectron) rootCls.add('is-electron');
rootCls.add(isMac ? 'platform-mac' : 'platform-win');

// 接入系统原生媒体控制 (macOS 控制中心 / Windows 10/11 音量弹窗 SMTC)
function syncMediaSession(series, episodeIndex, isPlayingNow) {
  if (!('mediaSession' in navigator)) return;

  if (series) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${series.series_title} - 第 ${episodeIndex} 集`,
      artist: '红果开源播放器',
      album: series.series_title,
      artwork: series.cover ? [{ src: series.cover, sizes: '512x512', type: 'image/jpeg' }] : []
    });
  }

  navigator.mediaSession.playbackState = isPlayingNow ? 'playing' : 'paused';

  navigator.mediaSession.setActionHandler('play', () => togglePlay());
  navigator.mediaSession.setActionHandler('pause', () => togglePlay());
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrevEpisode());
  navigator.mediaSession.setActionHandler('nexttrack', () => playNextEpisode());
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    if (videoEl.value) videoEl.value.currentTime = Math.max(0, videoEl.value.currentTime - (details.seekOffset || 5));
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    if (videoEl.value) videoEl.value.currentTime = Math.min(duration.value, videoEl.value.currentTime + (details.seekOffset || 5));
  });
}
```

---

### 4.4 核心改进四：打包配置与 CI/CD 流水线收敛

#### 4.4.1 修复 `package.json` 中的构建文件白名单
```json
"files": [
  "src/**/*",
  "build/icon.ico",
  "build/icon.icns",
  "build/icon.png",
  "package.json"
]
```

#### 4.4.2 收敛 `.github/workflows/build-release.yml` 触发策略
将正式 Release 构建严格收敛至发布 Git Tag 或手动触发，解除每次向 `main` 分支 push 均执行发布的浪费行为：
```yaml
name: Build & Release Native Apps

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      prerelease:
        description: '是否标记为预发布版本 (Pre-release)'
        required: true
        type: boolean
        default: false
```

---

## 5. 审查总结与推进建议

红果开源播放器在架构骨干上表现出了极高的代码规范性和清晰度，CENC 流媒体动态解密代理的设计尤为惊艳。通过落地本报告提出的 4 组核心改进方案：
1. **完善 Windows WCO 一体化标题栏**，消除双层标题栏，极大提升 Windows 用户的使用质感；
2. **重塑持久化存储的原子性与容灾机制**，规避 Windows 文件系统特有的 `EPERM` 锁崩溃与数据损坏；
3. **加固 Electron 生命周期与单实例锁定**，防止异步窗口创建竞态并补充系统级错误弹窗；
4. **校正打包资源白名单与规范 CI/CD 触发策略**，保障跨平台分发产物的完整性与工程构建的高效性。

项目将完全达到生产级商用跨平台桌面客户端的顶级工程质量标准。
