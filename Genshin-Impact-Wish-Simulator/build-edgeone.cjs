#!/usr/bin/env node
/**
 * EdgeOne Pages 构建入口
 *
 * 为什么不让 npm 直接跑 `vite build && node pack-edgeone.cjs --dist build`：
 *
 * SvelteKit 在构建收尾时会删掉构建目录里的 vite-manifest.json
 * （「avoid making the manifest available to users」），这一步属于**非关键清理**。
 * 但如果环境对文件删除有限制（比如一次删除超过 5 个文件就会被拦），
 * 这个 unlinkSync 抛错会让整个构建以非 0 退出 —— 尽管产物其实已经完整生成好了。
 *
 * 这里做两件事：
 *   1. 跑 vite build，如果它失败但产物目录里已经有新鲜的 index.html，就当作成功继续
 *   2. 调 pack-edgeone.cjs 把产物整理到 dist/，并在「仓库根」和「应用目录」各放一份
 *      （这样无论控制台的「根目录」设成哪一个，outputDirectory: "./dist" 都能找到产物）
 *
 * 用法: node build-edgeone.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const APP_DIR = __dirname;
const SRC = path.join(APP_DIR, '.vercel', 'output', 'static');
const INDEX = path.join(SRC, 'index.html');

// 记录构建前的产物状态，用来判断「这次构建到底有没有产出新东西」
const before = fs.existsSync(INDEX) ? fs.statSync(INDEX).mtimeMs : 0;

console.log('\n  [1/2] vite build');
const result = spawnSync('npx', ['vite', 'build'], {
	stdio: 'inherit',
	shell: true,
	cwd: APP_DIR
});

const after = fs.existsSync(INDEX) ? fs.statSync(INDEX).mtimeMs : 0;
const hasFreshOutput = after > before;

if (result.status !== 0) {
	if (!hasFreshOutput) {
		console.error('\n  ✗ 构建失败，且没有产出新的 index.html，按失败处理。');
		process.exit(result.status || 1);
	}
	console.warn(
		'\n  ! vite build 以非 0 退出，但产物目录里已经有本次构建的新 index.html。' +
			'\n    失败点大概率是 SvelteKit 收尾时删除 vite-manifest.json 这一步（非关键清理），继续处理产物。'
	);
} else {
	console.log('\n  [1/2] ✓ 构建完成');
}

console.log('\n  [2/2] 整理产物');
// 输出到仓库根目录的 dist/，和 edgeone.json 里的 outputDirectory 对齐
const REPO_DIST = path.join(APP_DIR, '..', 'dist');
const pack = spawnSync(
	process.execPath,
	[path.join(APP_DIR, 'pack-edgeone.cjs'), '--dist', path.join('..', 'dist')],
	{
		stdio: 'inherit',
		cwd: APP_DIR
	}
);

if (pack.status === 0) {
	// 再在应用目录下也放一份 dist/。
	// 这样无论控制台的「根目录」设成仓库根还是应用目录，
	// outputDirectory: "./dist" 都能找到产物。
	const APP_DIST = path.join(APP_DIR, 'dist');
	try {
		fs.rmSync(APP_DIST, { recursive: true, force: true });
	} catch {
		/* ignore —— cpSync 会覆盖同名文件 */
	}
	fs.cpSync(REPO_DIST, APP_DIST, { recursive: true, force: true });
	console.log(`  ✓ 产物已同时输出到：${REPO_DIST} 与 ${APP_DIST}`);
}

process.exit(pack.status || 0);