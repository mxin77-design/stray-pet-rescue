# 同城流浪猫狗救助线索登记

这是一个可分享的网页：用户提交同城流浪猫狗线索，后台统一查看记录。

## 本地运行

```bash
npm start
```

- 填写页：http://localhost:3000/
- 后台页：http://localhost:3000/admin.html
- 默认后台口令：`change-me`

## 推荐部署：Netlify + Supabase（不需要 Render 外国卡）

Netlify 负责发布网页和接口，Supabase 负责保存后台数据。

### 1. 创建 Supabase 数据库

1. 打开 Supabase，新建项目。
2. 进入 **SQL Editor**。
3. 复制 `supabase-schema.sql` 里的内容并运行。
4. 进入 **Project Settings** → **API**，复制：
   - `Project URL`
   - `service_role key`

### 2. 创建 Netlify 项目

1. 打开 Netlify，用 GitHub 登录。
2. 选择 **Add new site** → **Import an existing project**。
3. 选择 GitHub，并选择本仓库。
4. Build command 留空，Publish directory 填 `.`。
5. 添加环境变量：
   - `SUPABASE_URL`：Supabase 的 Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`：Supabase 的 service_role key
   - `ADMIN_TOKEN`：你自己的后台口令
6. 点击 Deploy。

部署完成后：

- 填写页：`https://你的-netlify-地址/`
- 后台页：`https://你的-netlify-地址/admin.html`

Netlify 会把 `/api/reports` 转发到 `netlify/functions/reports.js`，前端代码不用修改。

## 备用部署：Render + Persistent Disk

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
