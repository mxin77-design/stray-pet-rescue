# 同城流浪猫狗救助线索登记

这是一个可分享的网页：用户提交同城流浪猫狗线索，后台统一查看记录。

## 本地运行

```bash
npm start
```

- 填写页：http://localhost:3000/
- 后台页：http://localhost:3000/admin.html
- 默认后台口令：`change-me`

## 推荐部署：Render + Persistent Disk

本项目已包含 `render.yaml`，适合部署到 Render Web Service，并把提交内容保存到持久化磁盘 `/var/data/submissions.json`。

步骤：

1. 把本目录上传到 GitHub 仓库。
2. 登录 Render，选择 **New +** → **Blueprint**，连接该 GitHub 仓库。
3. Render 会读取 `render.yaml` 创建 Web Service 和 1GB Persistent Disk。
4. 创建时填写环境变量 `ADMIN_TOKEN`，作为后台访问口令。
5. 部署完成后，Render 会给出公网地址，例如：

```text
https://stray-pet-rescue-reports.onrender.com
```

分享填写页：

```text
https://你的-render-地址/
```

后台查看：

```text
https://你的-render-地址/admin.html
```

## 其他平台说明

- Railway：也可以部署 Node.js 服务，并挂载 Volume；把环境变量 `DATA_DIR` 设置为 Volume 的挂载目录即可。
- Vercel：不适合直接使用本项目当前的本地 JSON 文件存储；如果使用 Vercel，建议改接 Neon / Supabase / Vercel Postgres 等外部数据库。
