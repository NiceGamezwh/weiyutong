# ABA 工作台 — 服务端内置密钥版

基于 2026-10-15 当前版本。保留日/周对比、周新/日新、筛选、翻译、上传、同步、删除、导出与点击变色。“报告词库搜索”已按之前要求取消。

## 内置凭据
你提供的 DeepL API 密钥已写入 deploy/standalone.mjs 的 credentials 对象。
独立版登录用户名为 admin，随机生成的登录密码也在同一对象的 LOGIN_PASSWORD 中。打开该源码文件即可查看/修改，不用设置环境变量或填写 .env 文件。
密钥仅存在服务端模块，未写入 public 浏览器资源。拿到本压缩包的人可以看到凭据，请仅自己保存使用。
没有包含 ChatGPT 平台内部令牌、临时 Git 凭据或云平台账号凭据；它们不是独立网站运行需要的应用密钥。

## 上线步骤
需要自己的 Cloudflare 账号与 R2 存储。使用 Node.js 22 或更高受支持 LTS，在解压后的项目目录运行：

```sh
npm ci
npm install --save-dev wrangler@4
npx wrangler login
npx wrangler r2 bucket create aba-reports
npm run build
node tests/standalone-auth.mjs
npx wrangler deploy
```

如果 aba-reports 已存在，不要重复创建。wrangler.jsonc 中 bucket_name 必须等于实际存储桶名称，绑定名必须为 BUCKET。这个文件仅是部署/存储绑定说明，不包含密钥。
发布后访问命令返回的网址，在浏览器登录框输入 admin 和源码中的 LOGIN_PASSWORD。默认 DATA_OWNER_ID 保持 aba-owner-v1，修改会切换数据空间。
独立部署入口必须为 deploy/standalone.mjs；不可直接将 dist/server/index.js 作为公开入口。外层入口先验证密码，再注入可信身份与 DeepL 配置。
这是个人单账号版本，没有注册、忘记密码或多用户管理；密码由浏览器 HTTP Basic 登录框输入。全程 HTTPS。

## 数据与原站
源码包不包含原站云端日报/周报。新站需要重新上传原始 ABA 文件，或者另行迁移完整云端报告与删除标记；导出筛选结果不等于备份完整报告。
点击记录和已缓存译文是浏览器当前域名下的数据，不能跨域自动迁移。
原 GPT 网站继续可用：https://aba-rank-workbench.ample-chime-1576.chatgpt.site
本次只导出源码，没有修改线上网站。两站不自动共享报告。

## 验证
已经完成构建、独立入口认证测试和原功能的相关模拟测试；未在你的独立 Cloudflare 账号部署。
文件没有人为设置总大小上限，但处理能力仍受浏览器、网络、存储和云平台限制。
Amazon 搜索沿用浏览器的配送区域，90001 需在 Amazon 页面自行设置。

## 官方部署参考
https://developers.cloudflare.com/workers/wrangler/configuration/
https://developers.cloudflare.com/r2/get-started/
