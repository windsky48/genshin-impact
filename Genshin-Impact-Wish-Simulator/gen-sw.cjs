#!/usr/bin/env node
/**
 * 独立生成 Service Worker（sw.js）
 *
 * 为什么需要这个脚本：
 *   vite-plugin-pwa 在 rollup 的 closeBundle 阶段生成 sw.js，而 SvelteKit 的
 *   closeBundle 排在它前面。若 SvelteKit 那一步因环境限制报错（例如批量删除
 *   保护拦下了 `fs.unlinkSync(vite-manifest.json)`），整个构建会中断，
 *   vite-plugin-pwa 就没机会跑，产物里会缺 sw.js。
 *
 *   本脚本按 vite-plugin-pwa 相同的策略补生成 sw.js：
 *     esbuild 打包 src/sw.js  →  workbox-build injectManifest 注入预缓存清单
 *
 * 用法: node gen-sw.cjs [输出目录]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const esbuild = require('esbuild');
const { injectManifest } = require('workbox-build');

const APP_DIR = __dirname;
const OUT_DIR = path.resolve(process.argv[2] || path.join(APP_DIR, '.vercel', 'output', 'static'));
const SW_SRC = path.join(APP_DIR, 'src', 'sw.js');
const SW_DEST = path.join(OUT_DIR, 'sw.js');

(async () => {
	if (!fs.existsSync(OUT_DIR)) {
		console.error(`✗ 输出目录不存在：${OUT_DIR}\n  请先执行：npm run build`);
		process.exit(1);
	}
	if (!fs.existsSync(SW_SRC)) {
		console.error(`✗ 找不到 Service Worker 源文件：${SW_SRC}`);
		process.exit(1);
	}

	const tmp = path.join(os.tmpdir(), `pwa-sw-${Date.now()}.js`);

	// 1) 打包 src/sw.js（workbox-* 是 ESM，esbuild 可直接解析）
	await esbuild.build({
		entryPoints: [SW_SRC],
		bundle: true,
		format: 'iife',
		target: 'es2020',
		minify: false,
		define: { 'process.env.NODE_ENV': '"production"' },
		outfile: tmp,
		logLevel: 'error'
	});

	// 2) 注入预缓存清单（与 vite-plugin-pwa 的默认策略一致）
	const result = await injectManifest({
		globDirectory: OUT_DIR.replace(/\\/g, '/'),
		globPatterns: ['**/*.{js,css,html}'],
		globIgnores: ['**/node_modules/**/*', 'sw.js'],
		globStrict: false,
		swSrc: tmp,
		swDest: SW_DEST,
		maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
	});

	fs.unlinkSync(tmp);

	const size = fs.statSync(SW_DEST).size;
	console.log(`  ✓ 已生成 sw.js  (${result.count} 个预缓存条目, ${(size / 1024).toFixed(1)} KB)`);
	console.log(`    ${SW_DEST}`);
})().catch((e) => {
	console.error('✗ 生成 sw.js 失败：', e.message);
	process.exit(1);
});