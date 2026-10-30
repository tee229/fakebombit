# #17 微信小游戏开发环境核对：2026-10-30

后续：正式游戏移植已实现，以下保留环境准备时的事实范围。当前构建、实际开发者工具证据与真机缺口见[完整移植验证](issue-17-wechat-port.md)及[开发步骤](../wechat-development.md)。

## 阶段决定

用户要求关闭Chrome性能问题，准备进入微信小游戏适配并检查现有开发者工具。#16/#19据此关闭，首版进度14/15，#17进入开发环境核对。此为接受已知限制的范围决定，不是重新测量：原Chrome43.69/45.20 FPS、P95 33.2 ms、首局208.2 ms继续保留；全部功能人工验收已通过，#20/#21已关闭。

## 本机核对

| 项目 | 结果 | 依据 |
| --- | --- | --- |
| 微信开发者工具 | 已安装Stable 2.02.2609240，可启动 | 安装包package.json的version与window.title，沙箱外实际进程路径一致 |
| 安装路径 | `D:/Program Files (x86)/Tencent/微信web开发者工具` | 开始菜单快捷方式指向此目录 |
| CLI | `cli.bat --help`正常，提供open/islogin/preview等命令 | 在非沙箱环境执行官方CLI；未上传或预览项目 |
| CLI服务端口 | **51395已开启并连通** | 用户手动开启；官方cli.bat islogin已连接127.0.0.1:51395 |
| 登录状态 | **已登录且未过期** | islogin返回login=true；check_wechatide_status返回success=true、loginExpired=false |
| 官方wechatide自动化 | **兼容并已获Codex调用授权** | skillVersion=0.3.11、versionRelation=equal；CLI未启用额外令牌校验，未使用用户提供的MCP令牌 |
| 小游戏AppID与开发权限 | **已找到正式Fake Bomb It身份** | get_user_appids --type minigame返回Fake Bomb It，AppID为wx72341ad00af05fe1，isGameType=true；临时探针导入成功 |
| 已安装Node | v24.12.0 | node --version，与仓库engines要求一致 |
| 已安装pnpm | 10.27.0 | pnpm --version，与packageManager一致 |
| 小游戏基础库/模拟器编译 | **最小探针通过，基础库3.17.6** | 正式Fake Bomb It身份导入独立探针并开窗，控制台FBI_ENV_READY与实际画布截图确认运行 |
| 画布/渲染/音频API | **Canvas 2D、WebGL、音频对象创建通过** | wx.createCanvas取得2D上下文；第二离屏画布取得WebGL并clear；音频对象创建后销毁；未检查真实声音或真机表现 |
| 浏览器工程构建链 | **通过** | 沙箱外pnpm build完成TypeScript核心构建与Vite生产构建，产物仍为index-BWo4qtv0.js / index-BYCtvGa3.css；保留既有大包提示 |

**结论：本机已具备开始正式微信小游戏适配的开发环境。** 工具、端口、登录、正式项目身份和最小小游戏运行均已核实；完整游戏的引擎/资源/UI/输入/声音/生命周期迁移及真机联调仍属后续实施。不宣称该安装版本是官方当前最新版本；官方网页本轮访问不可用，版本以安装文件和进程为证据，API/工程要求经官方文档索引核对。

用户后续手动开启51395端口；官方CLI已确认登录，工具自带wechatide工作流成功完成Codex授权与兼容检查，并列出了与项目同名的正式小游戏身份。原“端口关闭/登录未知/AppID待确认”缺口已解除；不保留用户提供的MCP令牌，也不把账号openid、头像或测试号身份写入本记录。

安装诊断脚本曾因安装路径含空格，把命令截为`D:/Program`并返回cli_unavailable。检查其实现可见直接以shell方式拼接入口；用PowerShell正确引用同一wechatide.cmd后，帮助与真实状态检查均成功，说明这次为诊断脚本的路径引用误判。未修改安装目录、全局PATH或重装工具。

构建检查最初在受限沙箱中停留于pnpm启动且没有后续输出，已中止；随后获准在非沙箱环境执行，同一构建约2.8秒成功。未将沙箱无输出记为项目构建失败，也没有重复执行与本次环境检查无关的规则测试。

## 工程边界

当前正式源码/构建仍仅有浏览器入口`dist/web`，没有正式的小游戏构建目标。本轮在忽略目录`.scratch/issue-17-environment-2026-10-30`创建了仅含`game.js`、`game.json`和`project.config.json`的独立环境探针；它不是完整游戏移植。小游戏工程需要专用入口和项目配置，`compileType`为`game`；不能把`index.html`直接导入为小游戏。官方说明见[小游戏项目结构](https://developers.weixin.qq.com/minigame/dev/guide/develop/start)。

官方[Adapter说明](https://developers.weixin.qq.com/minigame/dev/guide/runtime/adapter)指出小游戏运行环境没有浏览器DOM/BOM。仓库`src/browser/main.ts`依赖document/window、DOM工具栏、ResizeObserver、网页焦点/可见性；背景音乐使用DOM audio。因此后续必须明确平台组装、UI/输入、资源和音频适配，保留纯TS对局规则与资源契约。此轮仅环境核对，没有实现或验证Phaser小游戏适配兼容性。

## 最小运行证据

使用与项目同名的正式小游戏身份（wx72341ad00af05fe1），未使用账号中的测试号。project_import返回success=true，open_project_window返回success=true、type=newopen、winId=s0。探针没有网络请求、玩法规则或上传动作；只创建画布、音频对象并绘制最多120帧。

控制台记录基础库3.17.6，以及FBI_ENV_READY：ready=true、platform=devtools、844×390、canvas2d=true、webgl=true、audioApi=true、errors=[]。该日志位于首次绘制前；随后实际[模拟器截图](assets/issue-17-environment-2026-10-30.jpg)确认requestAnimationFrame已执行、绘制可见。没有把frames=0的初始化日志误写为帧率测试，也未宣称120帧全部已测量。

automation_runtime_info(action=systemInfo)返回`timeout waiting for automator response`。随后get_simulator_console与simulator_screenshot均成功，配置的libVersion和控制台SDK均为3.17.6。因此记录为该自动化查询入口的限制，不将其归为小游戏启动失败，也不宣称所有自动化功能已通过。未反复重启工具或修改安全设置来掩盖超时。

官方wechatide的CLI调用不需要本机未启用的额外CLI令牌；用户提供的MCP令牌未使用、未保存，也未配置到仓库或Codex全局设置。Codex客户端授权由用户在开发者工具内确认后，polling_task_result返回authorized=true。本机连接检查使用51395端口。

## 下一步

1. 环境前置条件已完成：服务端口由用户开启、登录有效、正式AppID已找到、探针运行通过。无需用户重复提供这些信息。
2. 准备正式小游戏构建与平台入口，保留纯TS对局与资源契约，逐项适配引擎、DOM界面、资源、输入、声音、持久化和前后台生命周期。
3. 在实际工具与真机验证完整游戏；独立记录性能与工具自动化限制。官方CLI前置条件见[命令行说明](https://developers.weixin.qq.com/minigame/dev/devtools/cli)。

此记录中的未验证项不代表工具不支持该能力。没有更改系统安全/隐私设置、用户登录或发布状态。
