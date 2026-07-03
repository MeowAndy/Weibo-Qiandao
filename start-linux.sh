#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/web"
RUNTIME_DIR="$ROOT_DIR/.runtime"
JAR_FILE="$ROOT_DIR/WeiboComCheckin.jar"

log() { printf '\033[1;32m[Weibo-Qiandao]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Weibo-Qiandao]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[Weibo-Qiandao]\033[0m %s\n' "$*"; exit 1; }

if [[ ! -f "$WEB_DIR/server.js" ]]; then
  fail "未找到 web/server.js，请在项目根目录运行本脚本。"
fi

if [[ ! -f "$JAR_FILE" ]]; then
  fail "未找到 WeiboComCheckin.jar。请先把 WeiboComCheckin.jar 放到项目根目录：$ROOT_DIR"
fi

run_sudo() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "需要安装依赖但当前没有 sudo，请先手动安装 Node.js 18+。"
  fi
}

install_node_with_pm() {
  if command -v apt-get >/dev/null 2>&1; then
    log "尝试使用 apt 安装 Node.js/npm..."
    run_sudo apt-get update
    run_sudo apt-get install -y nodejs npm curl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    log "尝试使用 dnf 安装 Node.js/npm..."
    run_sudo dnf install -y nodejs npm curl ca-certificates tar gzip
  elif command -v yum >/dev/null 2>&1; then
    log "尝试使用 yum 安装 Node.js/npm..."
    run_sudo yum install -y nodejs npm curl ca-certificates tar gzip
  elif command -v pacman >/dev/null 2>&1; then
    log "尝试使用 pacman 安装 Node.js/npm..."
    run_sudo pacman -Sy --noconfirm nodejs npm curl ca-certificates tar gzip
  else
    fail "未找到支持的包管理器，请先手动安装 Node.js 18+ 和 npm。"
  fi
}

node_major() {
  node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  install_node_with_pm
fi

NODE_MAJOR="$(node_major)"
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 18 ]]; then
  fail "当前 Node.js 版本过低：$(node -v 2>/dev/null || echo 未安装)。请安装 Node.js 18 或更高版本后重新运行。"
fi
log "Node.js：$(node -v)，npm：$(npm -v)"

java_major() {
  local java_bin="${1:-java}"
  "$java_bin" -version 2>&1 | awk -F '"' '/version/ {print $2}' | awk -F. '{print $1}' | sed -E 's/[^0-9].*$//' || true
}

JAVA_BIN="java"
JAVA_MAJOR=""
if command -v java >/dev/null 2>&1; then
  JAVA_MAJOR="$(java_major java)"
fi

install_temurin23() {
  mkdir -p "$RUNTIME_DIR"
  local arch api_arch archive tmpdir downloader
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) api_arch="x64" ;;
    aarch64|arm64) api_arch="aarch64" ;;
    *) fail "暂不支持自动安装 Java 23 的架构：$arch，请手动安装 Java 23+。" ;;
  esac
  archive="$RUNTIME_DIR/temurin23.tar.gz"
  tmpdir="$RUNTIME_DIR/jdk-23-tmp"
  rm -rf "$tmpdir" "$RUNTIME_DIR/jdk-23" "$archive"
  mkdir -p "$tmpdir"
  log "正在下载 Temurin JDK 23（$api_arch），首次运行可能较慢..."
  if command -v curl >/dev/null 2>&1; then
    downloader=(curl -L --fail -o "$archive")
  elif command -v wget >/dev/null 2>&1; then
    downloader=(wget -O "$archive")
  else
    if command -v apt-get >/dev/null 2>&1; then run_sudo apt-get update; run_sudo apt-get install -y curl ca-certificates tar gzip; fi
    command -v curl >/dev/null 2>&1 || fail "缺少 curl/wget，无法自动下载 Java 23。"
    downloader=(curl -L --fail -o "$archive")
  fi
  "${downloader[@]}" "https://api.adoptium.net/v3/binary/latest/23/ga/linux/${api_arch}/jdk/hotspot/normal/eclipse"
  tar -xzf "$archive" -C "$tmpdir"
  local extracted
  extracted="$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "$extracted" && -x "$extracted/bin/java" ]] || fail "Java 23 下载或解压失败。"
  mv "$extracted" "$RUNTIME_DIR/jdk-23"
  rm -rf "$tmpdir" "$archive"
}

if [[ -z "$JAVA_MAJOR" || "$JAVA_MAJOR" -lt 23 ]]; then
  warn "未检测到 Java 23+，将使用项目内置运行时目录自动安装。"
  if [[ ! -x "$RUNTIME_DIR/jdk-23/bin/java" ]]; then
    install_temurin23
  fi
  JAVA_BIN="$RUNTIME_DIR/jdk-23/bin/java"
  JAVA_MAJOR="$(java_major "$JAVA_BIN")"
else
  JAVA_BIN="$(command -v java)"
fi

if [[ -z "$JAVA_MAJOR" || "$JAVA_MAJOR" -lt 23 ]]; then
  fail "Java 版本仍低于 23，请手动安装 Java 23+。"
fi
log "Java：$($JAVA_BIN -version 2>&1 | head -n 1)"

if [[ ! -f "$WEB_DIR/config.json" ]]; then
  cp "$WEB_DIR/config.example.json" "$WEB_DIR/config.json"
  log "已生成 web/config.json，请公网部署前修改 adminToken 和 smtpSetupKey。"
fi

if [[ "$JAVA_BIN" != "$(command -v java 2>/dev/null || true)" ]]; then
  node -e "const fs=require('fs');const p='$WEB_DIR/config.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));c.javaPath='$JAVA_BIN';fs.writeFileSync(p,JSON.stringify(c,null,2));"
  log "已把本地 Java 23 路径写入 web/config.json。"
fi

cd "$WEB_DIR"
if [[ ! -d node_modules ]]; then
  log "首次运行，正在安装 Web 依赖..."
  npm install
fi

URL="http://localhost:3000"
log "启动 Web 服务：$URL"
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2; xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

exec npm start
