# 原神抽卡模拟器 · EdgeOne Pages 部署指南

本仓库已适配 EdgeOne Pages（边缘安全加速）的两种发布方式：**Git 集成**（仓库已配置好，导入即可构建）和**本地构建 + 直接上传**。

---

## 一、EdgeOne Pages 上传硬性要求（我们已全部满足）

| 要求 | 上限 | 本项目产物 | 状态 |
|---|---|---|---|
| 上传格式 | 单个文件夹 / 单个 ZIP / 单个 HTML | 单个 ZIP | ✅ |
| 入口文件 | 根目录必须有 `index.html`（不能多套一层目录） | 根目录 `index.html` | ✅ |
| 文件数量 | ≤ 20,000 | 1,912 | ✅ |
| 单文件大小 | ≤ 25 MB | 最大 6.4 MB（`fonts/aaqishu.woff`） | ✅ |
| 文件名非法字符 | 不得含 `\ / : * ? " < > \|` | 无 | ✅ |

> 打包脚本 `pack-edgeone.cjs` 会在打包前自动逐条校验，任何一项不满足直接报错退出，不会产出一个传上去就 404 的包。

---

## 二、方式 A：Git 集成（推荐）

仓库源码已经针对 EdgeOne Pages 的构建流程做过适配，导入仓库后按下面几个参数填即可。

**项目设置 → 构建部署配置：**

| 配置项 | 值 |
|---|---|
| 框架预设 | 其它 / 自定义 |
| **根目录** | `Genshin-Impact-Wish-Simulator` |
| **构建命令** | `npm run build` |
| **输出目录** | `.vercel/output/static` |
| 安装命令 | 自动（仓库里同时有 `package-lock.json` 和 `yarn.lock`，检测到 npm 锁文件 → `npm install`） |
| Node 版本 | 20（仓库里有 `.nvmrc`，指定 `20.18.0`） |

> 想让输出目录更干净，可以用构建命令 `npm run build:edgeone` + 输出目录 `build`。
> 两种都验证过，产物完全一致。

**环境变量**（可选，「项目设置 → 环境管理」里配）：

| 变量 | 说明 | 默认 |
|---|---|---|
| `VITE_HOST` | 站点正式域名，用于 og:image / canonical 等 meta 标签 | 空 |
| `VITE_APP_TITLE` | 站点标题 | 原神祈愿模拟器 |
| `BASE_PATH` | 部署到子目录时用，例如 `/genshin` | 空（根目录） |

平台上的环境变量优先级高于仓库里的 `.env.production`，改域名直接在控制台配就行。

**仓库里为 EdgeOne 做的适配：**

| 文件 | 作用 |
|---|---|
| `edgeone.json`（仓库根目录） | SPA fallback + 缓存策略 + 安全响应头 |
| `.npmrc` | 把 sharp 的二进制下载指向 npmmirror 镜像，避免国内构建卡在 GitHub Releases |
| `.env.production` | 提交进仓库的构建默认值，`.env` 被 gitignore 时的兜底 |
| `.nvmrc` | 锁定 Node 20.18.0（EdgeOne 预装版本之一，不会触发额外下载） |
| `vite.config.js` | sharp 不可用时自动跳过图片优化，**构建不会再因此失败** |
| `package.json` 的 `build:edgeone` | 构建后把产物整理到 `build/`（可选） |

> **关于 `sharp`**：`vite-imagetools` 依赖 sharp，而 sharp 的原生二进制默认从 GitHub Releases 下载。
> 边缘构建机如果连不上 GitHub 就会挂掉。仓库里做了双重保险 ——
> `.npmrc` 指向镜像源，实在装不上时 `vite.config.js` 会跳过图片优化继续构建
> （只影响图片压缩率，不影响功能）。

---

## 三、方式 B：本地构建 + 直接上传

不想连 Git，或者想在本地先看效果，用这个。

### 1. 安装依赖

```bash
cd Genshin-Impact-Wish-Simulator
npm install
```

> **国内网络注意**：`sharp`（`vite-imagetools` 的依赖）需要下载 libvips 二进制。
> 仓库里的 `.npmrc` 已经指向 npmmirror 镜像，正常 `npm install` 即可；
> 如果你的 npm 版本不读 `.npmrc`，手动加两条：
>
> ```bash
> npm config set sharp_binary_host https://registry.npmmirror.com/-/binary/sharp
> npm config set sharp_libvips_binary_host https://registry.npmmirror.com/-/binary/sharp-libvips
> ```

### 2. 配置环境变量

```bash
cp .env.example .env
```

`.env` 里的 `VITE_HOST` 建议改成你最终要绑定的域名（用于 og:image、canonical 等 meta 标签）：

```ini
VITE_HOST="https://你的域名"
VITE_APP_TITLE="原神祈愿模拟器"
```

> `VITE_HOST` 不填也能跑，只是社交分享卡片上的图片地址会指向相对路径。

### 3. 构建

```bash
npm run build
```

产物输出在 `.vercel/output/static/`（**这是纯静态目录**，1912 个文件）。

### 4. 打包成 EdgeOne 可上传的 ZIP

```bash
npm run pack:edgeone
```

输出：`../edgeone-deploy.zip`

打包脚本做了 5 件事：

1. **校验** EdgeOne 的全部上传限制；
2. **补生成 sw.js**（若构建被环境因素中断导致缺失）；
3. **剔除** `vite-manifest.json`（SvelteKit 明确不建议公开）；
4. **补目录形式入口** —— 把 `screen/wishitem.html` 额外复制成 `screen/wishitem/index.html`，
   这样 `/screen/wishitem` 和 `/screen/wishitem/` 都能命中静态文件，不依赖平台的扩展名补全规则；
5. **生成 `edgeone.json`** —— 写入 SPA fallback 与缓存策略（见下）。

> 不想打 ZIP 也可以用 `npm run build:edgeone`，产物会整理到 `Genshin-Impact-Wish-Simulator/build/`，
> 直接把整个目录拖进上传区。

### 5. 上传

1. 打开 [EdgeOne Pages 控制台](https://pages.edgeone.ai/) → **创建项目** → 选择 **直接上传**；
2. 项目名填 5–50 位小写字母/数字/连字符（连字符不能开头结尾或连续）；
3. 选择加速区域；
4. 把 `edgeone-deploy.zip` **拖进上传区**；
5. 点「开始部署」，完成后用预览链接访问。

之后每次更新版本：在「构建部署」页点「新建部署」，拖入新的 ZIP 即可。

---

## 四、部署到子目录（可选）

默认是**根目录部署**（EdgeOne 默认域名 `xxx.edgeone.app` 和自定义域名都是根路径）。

如果要挂到 `https://example.com/genshin/` 这种子路径：

```bash
BASE_PATH=/genshin npm run build
npm run pack:edgeone
```

`BASE_PATH` 会同时作用于 SvelteKit 的路由前缀和 PWA manifest 的 `scope`/`start_url`，无需改任何源码。
用 Git 集成时，在控制台的环境变量里加 `BASE_PATH=/genshin` 即可。

---

## 五、`edgeone.json` 说明

仓库根目录和构建产物里都会有一份：

```json
{
  "rewrites": [{ "source": "/*", "destination": "/index.html" }],
  "headers": [
    { "source": "/*", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
    ]},
    { "source": "/internal/*", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]},
    { "source": "/images/*",  "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]},
    { "source": "/fonts/*",   "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]},
    { "source": "/videos/*",  "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]},
    { "source": "/sfx/*",     "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]},
    { "source": "/*.html",    "headers": [
      { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
    ]}
  ]
}
```

- `rewrites` 用的是 EdgeOne 认定的 **SPA fallback** 特例写法：先尝试匹配静态资源与 Functions 路由，
  都匹配不上才回退 `index.html`，由前端路由接管。**不要**再加别的重写规则，否则平台处理顺序不明确。
- `Cache-Control`：带哈希文件名的静态资源（`/internal/*`、`/images/*` 等）走一年强缓存；HTML 不缓存，
  保证发新版本能立刻生效。

---

## 六、名单（点名）功能怎么用

这个功能对应仓库里的「原神点名器」玩法：把一份名单传进去，抽卡时抽到的就是名单里的人。

### 1. 名单文件格式

纯文本 `.txt`，**UTF-8 编码**，每行一条，格式为 `星级 空格 名字`：

```
5 夜兰
5 纳西妲
5 妮露
4 砂糖
4 白术
4 烟绯
3 安柏
3 凯亚
3 芭芭拉
```

规则：

- 星级写 **3–5** 的整数，小于 3 或大于 5 会导致点名结果不显示；
- 「星级」和「名字」之间是**一个半角空格**；
- 如果一行里没有空格，整行会被当作名字，星级默认按 3 处理；
- 名字用中文，因为它是直接显示在抽卡结果上的。

仓库根目录有一份现成的示例：`示例名单.txt`。

### 2. 上传步骤

1. 点开页面后，点**左上角的问号按钮**（`?`），打开「菜单 / 选项」；
2. 滚到最下面一行「**导入名单**」；
3. 点「**选择文件**」，选中你的 `.txt`（文件名会显示在输入框右边）；
4. 点「**上传**」按钮 —— ⚠️ **这一步不能省**。文件输入框本身没有 change 事件处理，
   必须点「上传」才会真正触发 `loadMembers()` 读取文件；
5. 弹出「上传成功」即完成。

> 名单保存在浏览器 `localStorage`（键名 `WishSimulator.App` → `data.members`），
> 换浏览器或清除站点数据后会失效，需要重新上传。

### 3. 预设名单

不想自己准备 txt，可以在「选项」最下面一行「**预设名单**」里直接选：

| 预设 | 内容 |
|---|---|
| 示例名单（9 人） | 5★3 人 + 4★3 人 + 3★3 人的手写示例 |
| 五星角色 | 从游戏数据自动生成，全部 47 名 5★ 角色 |
| 四星角色 | 全部 42 名 4★ 角色 |
| 全部角色 | 全部 89 名角色 |
| 五星武器 | 全部 52 把 5★ 武器 |
| 清空名单 | 清空当前名单 |

角色/武器的名字会按当前界面语言自动本地化。

### 4. 名单管理（调星级）

侧栏新增「**名单管理**」分区（原来只有「选项」一个可点的入口 —— 原版把名单管理
做了一半就注释掉了，`menu.nameImport` 这个语言键甚至从来没进过语言文件）。

在这里可以：

- **逐条调整星级**：每条名字右边有 5★ / 4★ / 3★ 三个按钮，点一下就切换，
  名单按星级分组显示，5★ 在最上面；
- **删除单条**：每条右边的垃圾桶图标；
- **手动添加**：底部输入框 + 星级选择 + 「添加」；
- **批量设置**：「全部设为 5★ / 4★ / 3★」三个按钮；
- **切换抽取方式**：「按星级概率抽取」开关。

### 5. 星级对抽卡概率的影响

> **这是本仓库新增的功能，上游原版没有。**

原版的行为是：名单抽卡**完全等概率**（`wishMember.js` 里直接 `rand()`），
星级只决定奖励类型（3★ 给星尘，4★/5★ 给星辉），**不影响出现概率**。

现在默认按星级加权：

| 星级 | 权重 | 相对概率 |
|---|---|---|
| 5★ | 1 | 最稀有 |
| 4★ | 5 | 中等 |
| 3★ | 20 | 最容易出 |

举例：一份 3 个 5★ + 3 个 4★ + 3 个 3★ 的名单，
每人 5★ 概率约 3.8%、4★ 约 19%、3★ 约 77%。

想要旧版行为，在名单管理面板里关掉「按星级概率抽取」即可回到等概率。

权重定义在 `src/lib/helpers/roster.js` 的 `RARITY_WEIGHT`，可以直接改。

### 6. 使用

切到卡池轮播条的**第一个**（最左侧）卡池，那就是名单卡池，点「祈愿 ×1」或「祈愿 ×10」，
抽出来的就是名单里随机的人。

**没上传名单就抽这个卡池**，会弹出提示「请点击左上角问号去上传名单」。

### 7. 实测结果

用 `示例名单.txt`（9 人）在编译产物上跑通了完整链路：

| 步骤 | 结果 |
|---|---|
| 点击左上角问号 | 菜单打开，可见「导入名单 / 选择文件 / 上传」 |
| 选中 `示例名单.txt` | 输入框显示文件名 |
| 点「上传」 | 弹窗「上传成功」，localStorage 写入 9 条记录（`n-0` 夜兰 5★ … `n-8` 芭芭拉 3★） |
| 切到名单卡池 → 祈愿 ×1 | 抽中「**芭芭拉 ★★★**」 |

预设名单功能同样验证通过：展开下拉可见 6 个预设，应用「示例名单（9 人）」后
localStorage 写入 9 条（5★3 / 4★3 / 3★3），切到名单卡池抽卡命中名单成员。

---

## 七、其它可选部署方式

| 方式 | 说明 |
|---|---|
| **EdgeOne CLI** | `npx edgeone pages deploy <目录>`，适合 CI 里自动发布 |
| **Git 集成** | 控制台选「导入 Git 仓库」，平台侧自己跑构建（见第二节） |
| **Makers / Functions** | 本项目是纯静态，不需要 `edge-functions/` 或 `cloud-functions/` |
| **Docker** | 仓库根目录有 `Dockerfile`，`docker run -d -p 8000:80 maizig/ysdm:latest` |
| **服务器部署** | 把 `.vercel/output/static` 整个目录丢进 Nginx 站点根目录即可 |
| **本地运行** | 仓库根目录的 `启动点名器.bat`（Windows，双击即可）或 `node serve.js 8080 <目录>` |

---

## 八、已知问题

### 1. 仓库自带的 `electron-static/static/` 是坏的

预构建产物 **hydration 不接管** —— 打开后永远停在 "Connecting"（`data-sveltekit-hydrate` 属性不移除，
路由组件的 `onMount` 从不执行）。

官方文档《从源代码部署》里写的「网站运行目录设置为 `electron-static/static`」**按此操作会得到一个打不开的站点**。

✅ 正确做法：用 `npm run build` 自己构建，然后部署 `.vercel/output/static`。
上游的 `page.yml` 工作流会在每次推送后自动重新构建并提交这个目录。

### 2. Windows 上构建报 `spawn ENAMETOOLONG`

SvelteKit 调用 `loadEnv(mode, dir, '')`，空前缀会让 Vite 把**整个 process.env**（本机 26.7KB，
其中 `CODEBUDDY_MCP_CONFIG` 占 11KB）收集进 `env.private`，再 `JSON.stringify` 成一段几 KB 的字符串
塞进 prerender 子进程的 **argv**；加上子进程继承的 26.7KB 环境块，撞破 Windows 32767 字符命令行上限。

解法：构建前精简环境变量。

```bash
# Linux / macOS
env -u SOME_BIG_VAR npm run build

# Windows PowerShell
$env:SOME_BIG_VAR=$null; npm run build
```

> Linux 上没有这个限制（argv 上限约 2MB），所以 EdgeOne Pages 的构建机不受影响。

### 3. `npm run dev` 在部分环境会被安全删除策略打断

Vite 的依赖预构建会清空 `node_modules/.vite/deps_temp`。如果你的环境对批量删除有保护策略
（阈值 5 个文件），dev server 会崩在 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`。这是环境限制，与项目无关；
清空 `node_modules/.vite` 后重试即可。

---

## 九、许可

- 本仓库（原神抽卡模拟器）采用 **CC BY-NC-SA 4.0**，**不得用于商业用途**。
- 上游项目 WishSimulator 为 MIT 许可。
- 游戏素材版权归米哈游所有，本项目与米哈游无关联。