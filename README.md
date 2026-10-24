# GitHub Viewer — Android Device Flow

纯客户端 Android 应用：React + Vite + TypeScript + Capacitor，包名 `com.example.githubviewer`。使用 GitHub 官方 Device Flow，所有网络请求由 APK 直接发送至 GitHub。项目不需要部署任何额外应用服务。

## 认证方案

Device Flow 是 GitHub 官方为无后端设备提供的标准授权方案。它使用公开 Client ID 与短期设备码完成授权，不把应用密钥分发给客户端，避免了在 APK 中硬编码密钥后被提取的风险；在这个安全目标上优于客户端硬编码密钥的方案。用户的 GitHub 密码只在 GitHub 官方网站输入，App 不接收或保存密码。

依据：[GitHub 官方 Device Flow 文档](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)、[创建 OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)。

首次使用流程：

1. App 启动先读取 Android 加密存储；没有 token 时自动请求设备码。
2. 页面醒目显示 8 位用户码，例如 `WDJB-MJHT`（中间的连字符不算一位），以及剩余有效期。
3. 点击“打开 GitHub 验证”，通过系统浏览器访问 `https://github.com/login/device`，输入用户码并批准授权。也可以在另一台设备上的浏览器输入。
4. App 自动按 GitHub 返回的间隔检查授权结果。
5. 成功后把 token 加密保存，再请求账户资料及仓库列表。使用本 App 打开的浏览器标签会尝试关闭；如果系统未关闭它，返回 App 即可查看结果。
6. 下次打开 App，直接恢复凭据、加载账户，不再取码或打开浏览器。

设备流不依赖回调 URL，AndroidManifest.xml 无需登录 Deep Link，应用只保留启动 Activity 与 INTERNET 权限。Android 返回前台时会继续检查当前设备授权，不会另开浏览器。

## 项目结构

```text
.github/workflows/android-debug.yml     自动构建 Debug APK 并上传 artifact
android/                               完整 Android 工程与 Gradle Wrapper
  app/src/main/AndroidManifest.xml      INTERNET、禁用备份和明文流量
  app/src/main/java/com/example/githubviewer/
    MainActivity.java                  注册原生安全存储插件
    SecureVaultPlugin.java             Capacitor 安全存储桥接
    SecureVaultStorage.java            Android Keystore + AES-256-GCM
  app/src/androidTest/                  原生安全存储和登录页面测试
src/
  lib/device-flow.ts                   设备码、受控轮询、重试与取消
  lib/config.ts                        公开 Client ID 与固定 GitHub 验证网址
  lib/session.ts                       启动恢复、加密持久化、401 和退出
  lib/secure-storage.ts                Android 安全存储封装，无网页降级
  lib/http.ts                          Capacitor 原生 HTTPS 请求
  lib/github.ts                        账户和仓库 API、分页与错误分类
  lib/runtime.ts                       启动及返回前台的恢复处理
  components/LoginPage.tsx             用户码、倒计时及验证按钮
  components/Dashboard.tsx             账户资料、刷新、退出
  components/RepositoryList.tsx        仓库列表、搜索、公开/私有筛选
tests/                                 设备流与会话状态的自动测试
scripts/                               构建与安全检查
.env.example                           仅公开 Client ID
capacitor.config.ts
package-lock.json
```

## 先创建 GitHub OAuth App

你目前尚未创建 OAuth App，所以交付代码保留 `YOUR_GITHUB_CLIENT_ID`。占位符版 APK 可以安装、展示配置提示，但不能向 GitHub 完成真实授权。

1. 打开 [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)，选择 **New OAuth App / Register a new application**。
2. Application name 填 `GitHub Viewer`；Homepage URL 可填你的公开项目主页。
3. 注册表单如果要求 Authorization callback URL，填写一个有效的占位地址，例如 `http://127.0.0.1/unused`。设备流不会使用它，也不需要启动本地监听。
4. **勾选 Enable Device Flow**，这是必须的；没有启用时 GitHub 会返回 `device_flow_disabled`，App 会提示如何修正。
5. 保存后复制公开的 **Client ID**。
6. 保持或取消“Expire user access tokens”均可。本工程记录 token 的到期时间，到期后重新进行设备授权，不额外请求长期离线授权，也不保存刷新凭据。

本工程仅需要 Client ID，不需要填写任何其他应用凭据。不要把 GitHub 密码或其他私密凭据放入环境文件。

```powershell
Set-Location 'E:\GitHub Viewer'
Copy-Item .env.example .env.local
```

修改 `.env.local`：

```dotenv
VITE_GITHUB_CLIENT_ID=这里填写你的公开ClientID
```

修改 Client ID 后需要重新构建、同步和安装 APK。

## 设备流请求详情

获取设备码：

```http
POST https://github.com/login/device/code
Accept: application/json
Content-Type: application/x-www-form-urlencoded

client_id=...&scope=read%3Auser%20repo
```

GitHub 返回 `device_code`、`user_code`、`verification_uri`、`expires_in`、`interval`。其中设备码只保留在 App 进程内存，界面只接收可显示的用户码、验证网址和到期时间。

轮询请求：

```http
POST https://github.com/login/oauth/access_token
Accept: application/json
Content-Type: application/x-www-form-urlencoded

client_id=...&device_code=...&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code
```

| 响应 / 状态 | 应用行为 |
| --- | --- |
| `authorization_pending` | 保持用户码，等待下一次检查 |
| `slow_down` | 检查间隔至少增加 5 秒，并遵守 GitHub 返回的更长间隔 |
| 授权成功 | 停止轮询，加密保存 token，再请求用户与仓库 |
| 拒绝授权、过期、无效设备码 | 停止轮询并清理内存中的设备码，提供重新取码按钮 |
| 网络错误、429、5xx | 保留当前用户码，指数退避自动重试，直到本次用户码过期 |
| 用户取消、退出 | 停止定时器；丢弃已发出请求的迟到结果 |
| App 返回前台 | 如果已到检查时间，继续本轮授权，不创建重复轮询 |

首次轮询会等待 GitHub 指定的 interval；所有检查都串行进行，不并发刷接口。GitHub 通常给出 15 分钟有效期和 5 秒间隔，代码使用实际响应值，不硬编码它们。

Android 系统可能暂停后台 WebView 的 JavaScript 定时器。App 返回前台时会按有效期和间隔立即恢复，不能保证系统挂起期间持续执行。设备码不会持久化；进程被终止后，无 token 的新启动会自动请求新的用户码。

只在 GitHub 官方网址输入当前 App 显示的用户码；应用不接受其他域名的验证页面。

## 启动、刷新和退出

- 有 token：直接请求 `https://api.github.com/user` 与 `https://api.github.com/user/repos?per_page=100&sort=updated`，不请求设备码、不打开浏览器。
- 仓库超过 100 个：继续分页，包含可访问的私有仓库；不会把凭据发送到任意分页链接的其他域名。
- API 返回 401 或已知 token 到期：清除加密凭据，重新获取设备码。
- 网络错误、403、429、5xx：保留已有 token，显示重试；刷新失败时保留当前会话中已显示的资料。
- Keystore 读取失败：提示重试，不擅自删除数据或使用明文存储。
- 退出登录：清除本地凭据、当前设备码和内存资料。保持退出页面；下次新启动会自动取码。

API 返回的账户资料和仓库不做应用层磁盘缓存。头像、昵称、用户名以及仓库名、是否私有、主要语言、更新时间均来自 GitHub。提供刷新按钮、仓库搜索和可见性筛选。

`repo` 是 GitHub OAuth 的较宽仓库权限，应用实际只执行读取请求；组织的第三方应用限制或 SSO 仍可能影响仓库可见性。退出 App 不会撤销 GitHub 侧已授予的授权；如需撤销，去 GitHub Settings → Applications → Authorized OAuth Apps。

## Android 本地加密

原生 `SecureVault` 插件使用 Android Keystore 中不可导出的 AES-256 密钥，通过 AES-GCM 加密 token，每次写入使用系统生成的新 IV 和 128 位认证标签。私有存储只写入版本号、IV、密文和认证标签，不写入明文 token。

- JS 层不使用 localStorage、sessionStorage 或 Capacitor Preferences 保存凭据。
- 设备码只在内存中存在；不打印 token、设备码、请求体或原始异常。
- 已禁用应用备份、数据迁移中的应用文件备份、HTTP 明文流量、WebView 远程调试和 Capacitor 日志。
- 加密数据被篡改会导致 GCM 校验失败，读取失败不会自动擦除原始数据。
- 网页预览禁用真实登录，不提供明文降级。

[Android Keystore 官方说明](https://developer.android.com/privacy-and-security/keystore)。硬件安全支持取决于设备，不能把这种机制理解为对已被控制设备的绝对保护。

## 运行与构建 APK

需要 Node.js 24、npm、JDK 21、Android SDK Platform 36、Build Tools 36.0.0、platform-tools。最低 Android 7 / API 24，手机的 Android System WebView / Chrome 需保持更新。

```powershell
Set-Location 'E:\GitHub Viewer'
npm.cmd ci
npm.cmd test
npm.cmd run dev
```

Vite 显示网页预览地址，默认 `http://127.0.0.1:5173`。真实授权只在 Android APK 内执行。

Android 工程已经生成，不需要再次添加平台。安装 Android Studio 后配置 SDK：在 `android/local.properties` 中填写，例如 `sdk.dir=C\:/Users/你的用户名/AppData/Local/Android/Sdk`；此文件不提交仓库。当前机器使用已有 SDK `E:/APkMCJAVA/.android-sdk`。

```powershell
npm.cmd run android:sync
npm.cmd run android:open
```

Android Studio 选择模拟器或手机，点击 Run。命令行一键构建：

```powershell
npm.cmd run apk
```

输出：`outputs/GitHub-Viewer-debug.apk`，原始构建产物同时位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

```powershell
adb install -r '.\outputs\GitHub-Viewer-debug.apk'
```

Debug APK 使用开发签名，供测试安装。不同机器和临时 CI runner 的开发签名可能不同，更新安装要求签名一致；卸载旧包会清除凭据。公开分发时请另行使用稳定的 release 签名。

首次构建需要能够访问 npm、Google Maven、Maven Central 与 Gradle 下载服务。

## GitHub Actions

将工程上传到你自己的 GitHub 仓库，不要上传 `.env.local`、SDK、依赖目录、签名文件和构建目录。

在 **Settings → Secrets and variables → Actions → Variables** 创建一个公开变量：

| 变量 | 值 |
| --- | --- |
| `OAUTH_CLIENT_ID` | 你的 GitHub OAuth App Client ID |

不需要添加应用私密凭据。没有配置 Client ID 时仍可构建占位符版 APK，但无法真实授权。

推送到 `main` / `master`、发起 PR，或在 **Actions → Android Debug APK → Run workflow** 手动触发。workflow 会运行测试、前端构建、Capacitor 同步、安全检查、Android APK / 原生测试 APK 编译及 lint，然后上传 Debug APK。

在运行详情的 **Artifacts** 下载 `GitHub-Viewer-debug-运行编号`，解压后传到 Android 手机安装，产物保留 14 天。CI 默认不启动模拟器，因此只编译原生仪器测试；测试设备上的执行命令见下节。

## 验证

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:security
Set-Location android
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug --no-daemon
.\gradlew.bat :app:connectedDebugAndroidTest --no-daemon
```

原生仪器测试会清除这个安装包的本地登录凭据，请在测试设备执行。自动测试使用测试数据，不代表真实 GitHub 账户已经完成授权。

真实验收步骤：配置 Client ID 并开启 Device Flow → 启动自动取码 → 输入用户码授权 → 显示真实用户与仓库 → 划掉再打开直接恢复 → 断网重试保留 token → 退出清除 token → GitHub 撤销授权后收到 401 并重新取码。

你尚未创建 OAuth App，所以当前交付记录会将真实 GitHub 授权标为待配置验收；不使用测试资料冒充真实账户结果。
