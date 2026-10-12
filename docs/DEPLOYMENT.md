# 发布指南

## GitHub Pages 静态演示

当前公开演示采用 GitHub Pages 的 `main` 分支 `/docs` 文件夹发布，不需要把 GitHub 工作流权限交给项目。首次使用时，在 GitHub 仓库的 **Settings → Pages** 中将 Source 设为 **Deploy from a branch**，选择 `main` 与 `/docs`，然后保存。发布完成后的地址格式为：

```text
https://<GitHub 用户名>.github.io/<仓库名>/
```

该版本故意不配置 `AMAP_WEB_SERVICE_KEY`、`AI_API_KEY` 或其他服务端密钥。因此规则识别、地点池、安排、导出与恢复可用；在线城市查询、地图地点候选搜索及可选 AI 提取不可用，界面会给出对应提示。

若希望静态演示出现高德底图，可在本地构建公开版前配置下列**浏览器端**变量，并在高德控制台把 Pages 域名加入 Web JS Key 的域名白名单：

- `VITE_AMAP_JS_KEY`
- `VITE_AMAP_SECURITY_JS_CODE`

这些变量不是 Web 服务 Key；仍应限制可用域名。没有配置时地图区域会受控降级，地点整理不受影响。

## GitHub

本地仓库已准备好。连接你的 GitHub 账号后，创建名为 trip-atlas 的仓库，提交项目源代码。公开前检查 git status，确认 .env.local、node_modules、dist 未被纳入提交。

若使用 GitHub CLI：

```bash
gh auth login
gh repo create trip-atlas --public --source=. --remote=origin --push
```

首次发布前需要至少一次本地提交。若仓库名已被占用，选择新名称，不覆盖已有仓库。

## Vercel

从 GitHub 导入项目，选择 Vite 框架。仓库的 vercel.json 已定义构建输出与 Serverless API；Node 版本选择 24.x。

填写以下环境变量：
- VITE_AMAP_JS_KEY：Web端 JS API Key。
- VITE_AMAP_SECURITY_JS_CODE：JS API 安全配置。
- AMAP_WEB_SERVICE_KEY：Web服务 Key，仅服务端使用。
- AI_API_KEY、AI_BASE_URL、AI_MODEL：可选。暂时不填 Key，应用会明确显示 AI 未启用。

环境变量不是源码文件，勿上传 .env.local，也勿在 README 或日志中展示值。更改 VITE_ 变量需要重新构建部署。

部署完成后复制实际域名，在高德控制台为对应 Web 端 Key 配置域名安全限制。保留地图 Logo 与版权信息。复核账户对公开地图展示和 API 使用的授权及配额。

## 上线验收

在新的浏览器会话打开实际生产地址，完成：
1. 首次引导 → 杭州示例，底图和 3 个标记可见。
2. 返回自己的计划 → 新建 → 手动添加 → 确认地图位置。
3. 文字导入 → 检查候选 → 分配 Day → 编辑单日 → 刷新恢复。
4. 来源链接可回看；界面明确不自动读取正文。
5. 未配置模型时展示规则识别；配置后验证 AI 请求、原文证据与失败提示。
6. 手机宽度下表单可操作，地图版权可见。
7. 导出计划并恢复，原顺序、来源与交通段保留。

服务端提供输入上限、上游超时、通用错误和单实例限流。公开访问量增加后，应在托管平台配置持久限流和预算限制；当前内存限流不能保证跨 Serverless 实例的全局限制。

## 当前外部待办

- Vercel 账号连接和项目导入。
- 设置生产环境变量，确认高德线上域名配置。
- 可选：配置模型 API 并进行真实效果验收。

生产地址未验证成功前，不将本地地址当成已上线链接。
