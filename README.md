# Weibo-Qiandao

微博超话签到 Web 管理端。项目基于现有 `WeiboComCheckin.jar` 封装网页端，支持多账号扫码登录、Cookie 保存、定时签到、单账号日志、企业微信通知和 SMTP 邮件通知。

> 注意：仓库不包含 `WeiboComCheckin.jar`。请自行将该 JAR 放到项目根目录后运行。

## 功能特性

- 多账号管理：每个账号独立工作目录，Cookie 相互隔离。
- 网页扫码登录：直接在网页端打开 JAR 输出的微博登录二维码链接。
- Cookie 状态展示：显示是否已保存 Cookie、Cookie 到期时间、微博昵称。
- 定时签到：每个账号可单独设置每天签到时间。
- 手动签到：支持单账号立即签到。
- 防重复账号：扫码后识别重复 Cookie 账号并提示。
- 单账号日志：每个账号独立运行日志，支持单账号清理日志。
- 企业微信通知：每个账号单独配置企业微信应用通知。
- SMTP 邮件通知：全局配置发件 SMTP，每个账号只配置收件邮箱。
- 一键启动：Windows 下双击 BAT 自动检查环境、安装依赖并启动网页端。

## 目录结构

```text
weibo/
├─ WeiboComCheckin.jar          # 核心签到 JAR，需要自行放置
├─ 一键启动网页端.bat            # 推荐入口：自动安装依赖并启动
├─ 启动微博超话签到.bat          # 命令行版 JAR 启动脚本
└─ web/
   ├─ server.js                 # Web 后端
   ├─ package.json              # Node.js 依赖
   ├─ config.example.json       # 配置模板
   ├─ config.json               # 本地配置，默认不提交
   ├─ public/                   # 前端页面
   └─ data/                     # 账号、Cookie、日志数据，默认不提交
```

## Windows 一键使用

1. 确认 `WeiboComCheckin.jar` 放在项目根目录。
2. 双击根目录下的：

   ```text
   一键启动网页端.bat
   ```

3. 脚本会自动：
   - 检查 Node.js；没有时尝试用 `winget` 安装 Node.js LTS。
   - 检查 Java 23；没有时尝试用 `winget` 安装 Temurin 23 JDK。
   - 首次运行自动复制 `web/config.example.json` 为 `web/config.json`。
   - 首次运行自动执行 `npm install`。
   - 启动 Web 服务并打开浏览器。

4. 浏览器访问：

   ```text
   http://localhost:3000
   ```

> 如果自动安装 Node.js 或 Java 后仍提示找不到命令，请关闭当前窗口后重新双击 BAT。Windows 环境变量通常需要新窗口才会刷新。

## 手动启动

```powershell
cd web
npm install
npm start
```

访问：

```text
http://localhost:3000
```

## 配置说明

实际配置文件为 `web/config.json`，首次运行会从 `web/config.example.json` 自动生成。

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "jarPath": "../WeiboComCheckin.jar",
  "javaPath": "java",
  "defaultSchedule": "08:30",
  "adminToken": "change-this-token",
  "smtpSetupKey": "change-this-smtp-key"
}
```

字段说明：

- `port`：Web 端口。
- `host`：监听地址；公网服务器使用 `0.0.0.0`。
- `jarPath`：`WeiboComCheckin.jar` 路径。
- `javaPath`：Java 命令或 Java 可执行文件完整路径。
- `defaultSchedule`：新增账号默认签到时间。
- `adminToken`：API 访问令牌。公网运行时建议改成强随机字符串。
- `smtpSetupKey`：SMTP 发件配置秘钥。只有知道该秘钥的人才能保存或测试 SMTP 发件配置。

## SMTP 邮件通知

网页端上方有 SMTP 发件配置入口。

QQ 邮箱常用配置：

- SMTP 主机：`smtp.qq.com`
- 端口：`465`
- SSL：开启
- 用户名：完整 QQ 邮箱地址
- 密码：QQ 邮箱 SMTP 授权码，不是 QQ 登录密码

全局 SMTP 只负责发件；每个账号在账号卡片里单独配置收件邮箱。

签到完成后，邮件会发送账号、时间、状态和签到明细，例如：

```text
本次签到：29个，成功：0个，失败：0个，已签到：29个。
```

## 企业微信通知

每个账号可单独配置企业微信通知：

- 企业 ID / CorpID
- 应用 Secret
- 应用 AgentID
- 接收人 UserID，默认 `@all`

配置完成后可点击测试按钮验证。

## 公网部署建议

如果要在公网服务器运行：

1. 修改 `web/config.json` 里的 `adminToken` 和 `smtpSetupKey`。
2. 使用 Nginx、Caddy 或宝塔反向代理。
3. 建议配置 HTTPS。
4. 不要公开 `web/data` 目录。
5. 不要提交 `web/config.json`、`web/data`、`web/node_modules`。

## 数据保存位置

- 主数据：`web/data/store.json`
- 单账号目录：`web/data/accounts/`
- 每个账号的 Cookie：账号目录下的 `cookies.db`

## 注意事项

- 需要 Java 23 或更高版本。
- 需要 Node.js 18 或更高版本。
- 本项目不重写签到逻辑，只负责管理和调用 `WeiboComCheckin.jar`。
- 请遵守微博相关规则，合理使用。
