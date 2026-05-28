# 面了么

面试日程管理工具，支持智能识别面试邀请、日程提醒、冲突检测、日历导入、备份导入导出。项目可以作为 Web 应用部署，也可以通过 Capacitor 打包为 iOS App。

## 本地开发

```bash
npm install
npm run dev
```

本地开发默认由 `server.ts` 提供同源 `/api/parse-interview` 和 `/api/calendar.ics`。

## 自研 AI 服务

App 内不提供模型厂商、模型名或 API Key 配置。智能识别统一请求服务端 `/api/parse-interview`，由服务端使用环境变量调用你自己的 AI 服务。

服务端环境变量：

```bash
MIANLEME_AI_PROVIDER=volcengine
MIANLEME_AI_API_KEY=你的服务端密钥
MIANLEME_AI_MODEL=你的模型ID或endpoint ID
MIANLEME_AI_API_BASE=https://ark.cn-beijing.volces.com/api/v3
```

`MIANLEME_AI_PROVIDER` 支持 `volcengine`、`google`、`openai`、`anthropic`。面向 App Store 时，产品文案建议统一描述为“面了么自研 AI 服务”，不要让用户选择第三方模型或输入自己的密钥。

## Web 部署

Vercel 会运行：

```bash
npm run build
```

并把 `dist` 作为静态产物目录。部署后，在 Vercel Project Settings 配置上面的 `MIANLEME_*` 服务端环境变量。

## iOS App 构建

项目使用 Capacitor。和 PixelBead 一样，iOS 打包使用独立的 capacitor mode，把线上 API 域名注入到前端包里。

首次准备：

```bash
npm install
```

创建 `.env.capacitor`：

```bash
VITE_API_BASE_URL=https://interview.danzaii.cn
```

首次创建 iOS 工程：

```bash
npm run cap:add:ios
```

日常同步 Web 代码到 iOS：

```bash
npm run cap:sync
npm run cap:open
```

## Xcode 上架步骤

如果终端提示 `xcodebuild requires Xcode`，说明当前系统只选中了 Command Line Tools。先在本机切到完整 Xcode：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

1. 打开 Xcode 项目：`npm run cap:open`
2. 选中左侧 `App` project，再选 `App` target。
3. `Signing & Capabilities`：
   - Team 选择你的 Apple Developer Team。
   - Bundle Identifier 已默认配置为 `com.danzai.mianleme`，上架前确认它在 Apple Developer 后台可用。
   - 确认 Apple Developer 后台有同一个 Bundle ID。
4. `General`：
   - Display Name 确认为 `面了么`。
   - Version 设置为 App Store 版本号，例如 `1.0.0`。
   - Build 设置为递增整数，例如 `1`。
   - Deployment Target 选择你要支持的最低 iOS 版本。
5. 图标和启动图：
   - 准备 `1024x1024` 无透明 App Icon。
   - 可以临时运行 `npx @capacitor/assets generate --ios` 生成资源，或在 Xcode 的 `Assets.xcassets` 手动替换。
6. 权限文案：
   - `ios/App/App/Info.plist` 已包含 `NSPhotoLibraryUsageDescription` 和 `NSCameraUsageDescription`，用于传图识别面试邀请。
   - 如后续改变图片用途，需要同步更新这两段权限文案。
7. 真机测试：
   - 选择你的 iPhone，点击 Run。
   - 测试新增面试、智能识别、打开会议链接、导入日历、备份导入导出。
8. 归档上传：
   - Scheme 选择 `App`，设备选择 `Any iOS Device`。
   - `Product > Archive`。
   - Archive 完成后点 `Distribute App`，选择 App Store Connect 上传。
9. App Store Connect：
   - 填写名称、分类、截图、描述、隐私政策 URL。
   - App Privacy 需要说明面试文本/图片会发送到你的服务端用于智能识别。
   - AI 功能文案建议写“由面了么自研 AI 服务提供面试邀请识别”，避免出现“用户自行配置 OpenAI/Gemini API Key”这类审核风险点。

## 关键配置

- `capacitor.config.ts`
  - `appId`: 当前为 `com.danzai.mianleme`，上架前需要在 Apple Developer 里创建同名 Bundle ID。
  - `appName`: `面了么`
  - `webDir`: `dist`
  - `server.allowNavigation`: 已加入 `interview.danzaii.cn` 和 `mianleme.vercel.app`。
- `.env.capacitor`
  - `VITE_API_BASE_URL`: iOS 包内请求的线上 HTTPS API 根地址，当前本机已配置为 `https://interview.danzaii.cn`。
- `api/handler.ts`
  - Vercel 服务端入口，密钥只从服务端环境变量读取。
