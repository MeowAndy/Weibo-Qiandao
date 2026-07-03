# Weibo-Qiandao

微博超话签到 Web 管理端。项目基于现有 `WeiboComCheckin.jar` 封装网页端，支持多账号扫码登录、Cookie 保存、定时签到、全部签到、单账号日志、企业微信通知、SMTP 邮件通知和全部签到汇总邮件。

> 注意：仓库不直接包含 `WeiboComCheckin.jar`。Windows / Linux 一键脚本会在首次运行时从作者公开地址自动下载：`https://wb.dsttl3.cn/app/download/WeiboComCheckin.jar`。如果自动下载失败，也可以手动下载后放到项目根目录。

## 功能特性

- 多账号管理：每个账号独立工作目录，Cookie 相互隔离。
- 网页扫码登录：直接在网页端打开 JAR 输出的微博登录二维码链接。
- Cookie 状态展示：显示是否已保存 Cookie、Cookie 到期时间、微博昵称。
- 定时签到：每个账号可单独设置每天签到时间。
- 手动签到：支持单账号立即签到和全部账号依次签到。
- 防重复账号：扫码后识别重复 Cookie 账号并提示。
- 单账号日志：每个账号独立运行日志，支持单账号清理日志。
- 企业微信通知：每个账号单独配置企业微信应用通知。
- SMTP 邮件通知：全局配置发件 SMTP，每个账号只配置收件邮箱。
- 全部签到汇总邮件：全部签到完成后，统一发送所有账号签到结果到指定邮箱。
- 一键启动：Windows 下双击 BAT，Linux 下运行 Shell 脚本，自动检查环境、安装依赖并启动网页端。

## 目录结构

```text
weibo/
├─ WeiboComCheckin.jar          # 核心签到 JAR，首次运行可自动下载
├─ 一键启动网页端.bat            # 推荐入口：自动安装依赖并启动
├─ start-linux.sh               # Linux 一键启动脚本
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

1. 双击根目录下的：

   ```text
   一键启动网页端.bat
   ```

2. 脚本会自动：
   - 如果根目录没有 `WeiboComCheckin.jar`，自动从作者公开地址下载。
   - 检查 Node.js；没有时尝试用 `winget` 安装 Node.js LTS。
   - 检查 Java 23；没有时尝试用 `winget` 安装 Temurin 23 JDK。
   - 首次运行自动复制 `web/config.example.json` 为 `web/config.json`。
   - 首次运行自动执行 `npm install`。
   - 启动 Web 服务并打开浏览器。

3. 浏览器访问：

   ```text
   http://localhost:3000
   ```

> 如果自动安装 Node.js 或 Java 后仍提示找不到命令，请关闭当前窗口后重新双击 BAT。Windows 环境变量通常需要新窗口才会刷新。

## Linux 一键使用

1. 克隆仓库并进入目录：

   ```bash
   git clone https://github.com/MeowAndy/Weibo-Qiandao.git
   cd Weibo-Qiandao
   ```

2. 执行一键启动脚本：

   ```bash
   chmod +x start-linux.sh
   ./start-linux.sh
   ```

3. 脚本会自动：
   - 如果根目录没有 `WeiboComCheckin.jar`，自动从作者公开地址下载。
   - 检查 Node.js 和 npm；缺失时尝试用系统包管理器安装。
   - 检查 Java 23；缺失时自动下载 Temurin JDK 23 到项目内 `.runtime/jdk-23`。
   - 首次运行自动复制 `web/config.example.json` 为 `web/config.json`。
   - 首次运行自动执行 `npm install`。
   - 启动 Web 服务。

4. 浏览器访问：

   ```text
   http://服务器IP:3000
   ```

> Linux 公网部署前，请务必修改 `web/config.json` 里的 `adminToken` 和 `smtpSetupKey`。

### Linux 后台运行示例

如果希望断开 SSH 后继续运行，可使用 `nohup`：

```bash
nohup ./start-linux.sh > weibo-web.log 2>&1 &
```

查看日志：

```bash
tail -f weibo-web.log
```

## 手动启动

Windows PowerShell：

```powershell
cd web
npm install
npm start
```

Linux/macOS：

```bash
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

## 核心 JAR 下载

项目不会把 `WeiboComCheckin.jar` 上传到 GitHub，但一键脚本会自动下载到项目根目录。

公开下载地址：

```text
https://wb.dsttl3.cn/app/download/WeiboComCheckin.jar
```

如果自动下载失败，可以手动下载后放到：

```text
Weibo-Qiandao/WeiboComCheckin.jar
```

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

### 全部签到汇总邮箱

在网页上方的 `SMTP 邮件发件配置` 中可以设置 `全部签到汇总邮箱`。

- 单账号立即签到：仍按该账号自己的通知配置发送。
- 全部签到：会依次执行所有账号签到，完成后统一发送一封汇总邮件到你设置的汇总邮箱。
- 如果未启用汇总邮箱，日志会显示 `全部签到汇总邮箱已关闭`。

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
2. 放行端口 `3000`，或使用 Nginx、Caddy、宝塔反向代理。
3. 建议配置 HTTPS。
4. 不要公开 `web/data` 目录。
5. 不要提交 `web/config.json`、`web/data`、`web/node_modules`、`WeiboComCheckin.jar`。

Nginx 反向代理示例：

```nginx
server {
   listen 80;
   server_name example.com;

   location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
   }
}
```

## 数据保存位置

- 主数据：`web/data/store.json`
- 单账号目录：`web/data/accounts/`
- 每个账号的 Cookie：账号目录下的 `cookies.db`

## 注意事项

- 需要 Java 23 或更高版本。
- 需要 Node.js 18 或更高版本。
- Linux 一键脚本会优先使用系统 Java；若系统 Java 低于 23，会下载项目内独立 Java 23，不会上传到 GitHub。
- 本项目不重写签到逻辑，只负责管理和调用 `WeiboComCheckin.jar`。
- 请遵守微博相关规则，合理使用。
