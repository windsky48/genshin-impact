#!/usr/bin/env node
/**
 * EdgeOne Pages 产物准备 / 打包脚本
 *
 * 两种用法：
 *   1) 打包成可直接拖拽上传的 ZIP
 *        node pack-edgeone.cjs                       → ../edgeone-deploy.zip
 *        node pack-edgeone.cjs --out x.zip
 *
 *   2) 整理成目录（EdgeOne Pages Git 集成用，输出目录填 build）
 *        node pack-edgeone.cjs --dist build
 *
 * 做的准备：
 *   1. 校验 EdgeOne Pages 的硬性限制（文件数 / 单文件大小 / 文件名非法字符 / 入口文件）
 *   2. 补生成缺失的 sw.js（离线缓存 / PWA 安装）
 *   3. 剔除 vite-manifest.json（SvelteKit 不建议公开）
 *   4. 为子路由生成目录形式的 index.html（screen/wishitem.html → screen/wishitem/index.html），
 *      这样 /screen/wishitem 和 /screen/wishitem/ 都能命中静态文件，不依赖平台的扩展名补全规则
 *   5. 写入 edgeone.json（SPA fallback + 缓存策略 + 安全响应头）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const APP_DIR = __dirname;
const SRC = path.join(APP_DIR, '.vercel', 'output', 'static');

// ---------- 参数 ----------
const args = process.argv.slice(2);
const getArg = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const hasArg = (name) => args.includes(name);
const OUT = path.resolve(getArg('--out', path.join(APP_DIR, '..', 'edgeone-deploy.zip')));
const DIST = getArg('--dist', '');

// ---------- EdgeOne Pages 限制 ----------
const MAX_FILES = 20000;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ILLEGAL_NAME = /[\\/:*?"<>|]/;

const log = (...a) => console.log(...a);
const fmtMB = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';

function walk(dir, base = '') {
	let out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) out = out.concat(walk(abs, rel));
		else out.push({ rel, abs, size: fs.statSync(abs).size });
	}
	return out;
}

/**
 * 对构建产物做 EdgeOne Pages 上线前的准备（原地修改 srcDir）
 * @param {string} srcDir 构建产物目录
 * @returns {Array} 处理后的文件列表
 */
function prepare(srcDir) {
	if (!fs.existsSync(srcDir)) {
		console.error(`✗ 找不到构建产物：${srcDir}\n  请先执行：npm run build`);
		process.exit(1);
	}

	let files = walk(srcDir);
	log(`  源目录: ${srcDir}`);

	// 1) 校验
	const errors = [];

	if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
		errors.push('根目录缺少 index.html（EdgeOne 要求它作为入口文件）');
	}
	if (files.length > MAX_FILES) {
		errors.push(`文件数 ${files.length} 超过上限 ${MAX_FILES}`);
	}

	const tooBig = files.filter((f) => f.size > MAX_FILE_SIZE);
	if (tooBig.length) {
		tooBig.forEach((f) => errors.push(`文件超过 25MB：${f.rel} (${fmtMB(f.size)})`));
	}

	const badNames = files.filter((f) => ILLEGAL_NAME.test(f.rel.split('/').pop()));
	if (badNames.length) {
		badNames.slice(0, 10).forEach((f) => errors.push(`文件名含非法字符：${f.rel}`));
	}

	if (!files.some((f) => f.rel === 'index.html')) {
		const dirs = new Set(files.map((f) => f.rel.split('/')[0]));
		if (dirs.size === 1) {
			errors.push(`index.html 埋在子目录 "${[...dirs][0]}/" 里，必须提到最外层`);
		}
	}

	if (errors.length) {
		log('\n  ✗ 不符合 EdgeOne Pages 上传要求：');
		errors.forEach((e) => log(`    - ${e}`));
		process.exit(1);
	}
	log(`  ✓ 校验通过：${files.length} 个文件，最大 ${fmtMB(Math.max(...files.map((f) => f.size)))}`);

	// 2) 确保 Service Worker 存在
	// vite-plugin-pwa 在 rollup closeBundle 阶段生成 sw.js；若 SvelteKit 的 closeBundle
	// 先报错中断（例如被环境的批量删除保护拦下），sw.js 就会缺失，这里补生成。
	const swPath = path.join(srcDir, 'sw.js');
	if (!fs.existsSync(swPath)) {
		log('  ! 未找到 sw.js，正在补生成（离线缓存 / PWA 安装）…');
		const { execFileSync } = require('child_process');
		try {
			const out = execFileSync(process.execPath, [path.join(__dirname, 'gen-sw.cjs'), srcDir], {
				encoding: 'utf8'
			});
			log('  ' + out.trim().split('\n').join('\n  '));
		} catch (e) {
			log('  ! sw.js 生成失败（不影响站点使用，只是没有离线缓存）：' + (e.message || e));
		}
	} else {
		log('  ✓ sw.js 已存在');
	}

	// 3) 剔除不应公开的构建清单
	// （某些环境对文件删除有限制，删不掉也不影响上线）
	const manifestPath = path.join(srcDir, 'vite-manifest.json');
	if (fs.existsSync(manifestPath)) {
		try {
			fs.unlinkSync(manifestPath);
			log('  ✓ 已剔除 vite-manifest.json（SvelteKit 不建议公开）');
		} catch {
			log('  · vite-manifest.json 保留（环境限制删不掉，不影响上线）');
		}
	}

	// 4) 生成目录形式的入口
	const htmlFiles = files.filter((f) => f.rel.endsWith('.html') && f.rel !== 'index.html');
	let added = 0;
	for (const f of htmlFiles) {
		const noExt = f.rel.replace(/\.html$/, '');
		const dirPath = path.join(srcDir, noExt, 'index.html');
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(path.dirname(dirPath), { recursive: true });
			fs.copyFileSync(f.abs, dirPath);
			added++;
		}
	}
	if (added) log(`  ✓ 已为 ${added} 个子路由生成目录形式入口（/xxx 与 /xxx/ 均可访问）`);

	// 5) 写入 edgeone.json
	const edgeoneJson = {
		rewrites: [
			{
				source: '/*',
				destination: '/index.html'
			}
		],
		headers: [
			{
				source: '/*',
				headers: [
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
				]
			},
			{
				source: '/internal/*',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
			},
			{
				source: '/images/*',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
			},
			{
				source: '/fonts/*',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
			},
			{
				source: '/videos/*',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
			},
			{
				source: '/sfx/*',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
			},
			{
				source: '/*.html',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }]
			}
		]
	};
	fs.writeFileSync(
		path.join(srcDir, 'edgeone.json'),
		JSON.stringify(edgeoneJson, null, 2) + '\n',
		'utf8'
	);
	log('  ✓ 已生成 edgeone.json（SPA fallback + 缓存策略）');

	return walk(srcDir);
}

// ---------- ZIP 打包（纯 Node，零依赖） ----------
function zip(srcDir, outFile) {
	const files = walk(srcDir);

	const crcTable = (() => {
		const t = new Int32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c;
		}
		return t;
	})();

	function crc32(buf) {
		let c = -1;
		for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
		return (c ^ -1) >>> 0;
	}

	const dosTime = (d) =>
		((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
	const dosDate = (d) =>
		(((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);

	const chunks = [];
	const central = [];
	let offset = 0;
	const now = new Date();
	const dtime = dosTime(now);
	const ddate = dosDate(now);

	for (const f of files) {
		const data = fs.readFileSync(f.abs);
		const nameBuf = Buffer.from(f.rel.split('/').join('\\'), 'utf8');
		const comp = zlib.deflateRawSync(data, { level: 9 });
		const useDeflate = comp.length < data.length;
		const payload = useDeflate ? comp : data;
		const method = useDeflate ? 8 : 0;
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0, 6);
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(dtime, 10);
		local.writeUInt16LE(ddate, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);

		chunks.push(local, nameBuf, payload);

		const cd = Buffer.alloc(46);
		cd.writeUInt32LE(0x02014b50, 0);
		cd.writeUInt16LE(20, 4);
		cd.writeUInt16LE(20, 6);
		cd.writeUInt16LE(0, 8);
		cd.writeUInt16LE(method, 10);
		cd.writeUInt16LE(dtime, 12);
		cd.writeUInt16LE(ddate, 14);
		cd.writeUInt32LE(crc, 16);
		cd.writeUInt32LE(payload.length, 20);
		cd.writeUInt32LE(data.length, 24);
		cd.writeUInt16LE(nameBuf.length, 28);
		cd.writeUInt32LE(offset, 42);
		central.push(cd, nameBuf);

		offset += local.length + nameBuf.length + payload.length;
	}

	const cdBuf = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(cdBuf.length, 12);
	end.writeUInt32LE(offset, 16);

	fs.writeFileSync(outFile, Buffer.concat([...chunks, cdBuf, end]));
	return files.length;
}

// ---------- 入口 ----------
log('\n  EdgeOne Pages 产物准备');
log('  ' + '-'.repeat(46));

const files = prepare(SRC);

if (hasArg('--dist')) {
	const dist = path.resolve(APP_DIR, DIST);
	// 先清空目标目录；某些环境对批量删除有限制，删不掉就直接覆盖写入
	try {
		fs.rmSync(dist, { recursive: true, force: true });
	} catch {
		/* ignore —— 下面的 cpSync 会覆盖同名文件 */
	}
	fs.mkdirSync(path.dirname(dist), { recursive: true });
	fs.cpSync(SRC, dist, { recursive: true, force: true });
	log('');
	log('  ✓ 已整理到目录（EdgeOne Pages 的「输出目录」填这个路径）');
	log('  ' + '-'.repeat(46));
	log(`  目录: ${dist}`);
	log(`  文件数: ${files.length}`);
	log('');
} else {
	const count = zip(SRC, OUT);
	log('');
	log('  ✓ 打包完成');
	log('  ' + '-'.repeat(46));
	log(`  ZIP: ${OUT}`);
	log(`  大小: ${fmtMB(fs.statSync(OUT).size)}  (${count} 个文件)`);
	log('');
	log('  上传步骤：');
	log('    1. 打开 EdgeOne Pages 控制台 → 创建项目 → 选择「直接上传」');
	log(`    2. 拖拽这个 ZIP：${path.basename(OUT)}`);
	log('    3. 等待部署完成，用预览链接访问');
	log('');
}