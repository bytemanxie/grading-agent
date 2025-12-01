# GitHub Actions 自动部署配置

## 配置步骤

### 1. 在 GitHub 仓库中设置 Secrets

前往仓库的 `Settings` -> `Secrets and variables` -> `Actions`，添加以下 secrets：

| Secret 名称           | 说明                      | 示例                             |
| --------------------- | ------------------------- | -------------------------------- |
| `SERVER_HOST`         | 服务器 IP 地址或域名      | `192.168.1.100` 或 `example.com` |
| `SERVER_USER`         | SSH 登录用户名            | `root` 或 `ubuntu`               |
| `SERVER_SSH_KEY`      | SSH 私钥内容              | 完整的私钥文本                   |
| `SERVER_PORT`         | SSH 端口（可选，默认 22） | `22`                             |
| `SERVER_PROJECT_PATH` | 服务器上项目的绝对路径    | `/home/www/grading-agent`        |

### 2. 生成 SSH 密钥对（如果还没有）

在本地运行：

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com" -f ~/.ssh/github_deploy_key
```

### 3. 将公钥添加到服务器

将生成的公钥（`~/.ssh/github_deploy_key.pub`）添加到服务器的 `~/.ssh/authorized_keys`：

```bash
# 在本地执行
ssh-copy-id -i ~/.ssh/github_deploy_key.pub user@server_ip

# 或手动添加
cat ~/.ssh/github_deploy_key.pub | ssh user@server_ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 4. 将私钥添加到 GitHub Secrets

复制私钥内容：

```bash
cat ~/.ssh/github_deploy_key
```

将完整的私钥内容（包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`）粘贴到 GitHub 的 `SERVER_SSH_KEY` secret 中。

### 5. 服务器准备

确保服务器上：

1. 已安装 Git
2. 已克隆了项目仓库
3. 已安装 Node.js 18+ 和 pnpm
4. 项目目录有正确的权限
5. （可选）已安装和配置 PM2 进程管理器

```bash
# 克隆项目
cd /home/www
git clone git@github.com:username/grading-agent.git

# 安装依赖
cd grading-agent
pnpm install

# 首次构建
pnpm build

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加 DASHSCOPE_API_KEY 等配置
```

## 工作流说明

当你推送代码到 `main` 分支且 `src/` 目录有变更时，GitHub Actions 会自动：

1. 连接到服务器
2. 进入项目目录
3. 拉取最新代码（`git pull origin main`）
4. 安装依赖（`pnpm install`）
5. 构建项目（`pnpm build`）
6. 重启 PM2 进程（`pm2 restart grading-agent`）

## PM2 配置

如果首次部署，需要手动启动一次：

```bash
cd /path/to/grading-agent
pm2 start pnpm --name "grading-agent" -- start:prod
pm2 save
```

## 自定义部署脚本

你可以根据需要修改 `.github/workflows/deploy.yml` 中的 `script` 部分，例如：

- 添加数据库迁移命令
- 使用 Docker 部署
- 发送部署通知
- 运行测试
- 清理缓存等

## 故障排查

### 连接失败

- 检查服务器防火墙是否允许 GitHub Actions 的 IP
- 验证 SSH 密钥是否正确配置
- 确认服务器端口是否正确

### Git pull 失败

- 确保服务器上的 Git 仓库状态干净（没有未提交的更改）
- 检查服务器是否有权限访问 GitHub 仓库

### 构建失败

- 检查服务器上 Node.js 版本是否满足要求（18+）
- 确认 pnpm 已正确安装
- 查看 GitHub Actions 的日志输出
- 检查环境变量是否已正确配置（`.env` 文件）

### PM2 启动失败

- 检查 PM2 是否已安装：`pm2 --version`
- 查看 PM2 日志：`pm2 logs grading-agent`
- 确认 `start:prod` 脚本在 `package.json` 中已定义
- 检查端口是否被占用
