#!/usr/bin/env node
/**
 * 零依赖静态服务器 —— 用于本地运行编译好的「原神抽卡模拟器」
 *
 * 用法：
 *   node serve.js            # 默认 8080 端口，根目录为同级的 site/
 *   node serve.js 9000       # 指定端口
 *   node serve.js 9000 ./out # 指定根目录
 *
 * 之所以需要它：项目是 SvelteKit SPA，产物用的是 <script type="module">，
 * 浏览器会以 CORS 策略拒绝从 file:// 直接加载 ES Module，所以必须走 http。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const port = Number(process.argv[2]) || 8080;
const root = path.resolve(process.argv[3] || path.join(__dirname, 'site'));

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.webp': 'image/webp',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.txt': 'text/plain; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8',
	'.map': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
	let urlPath;
	try {
		urlPath = decodeURIComponent(req.url.split('?')[0]);
	} catch {
		urlPath = '/';
	}

	let filePath = path.join(root, urlPath);

	// 防目录穿越
	if (!filePath.startsWith(root)) {
		res.writeHead(403).end('403 Forbidden');
		return;
	}

	fs.stat(filePath, (err, stat) => {
		if (!err && stat.isDirectory()) {
			// 目录 → 优先取目录内的 index.html（与 EdgeOne Pages 行为一致）
			const idx = path.join(filePath, 'index.html');
			if (fs.existsSync(idx)) {
				filePath = idx;
			} else {
				filePath = path.join(root, 'index.html');
			}
		} else if (err) {
			// 文件不存在
			const hasExt = path.extname(urlPath) !== '';
			if (hasExt) {
				// 带扩展名 → 一律 404（不能返回 HTML，否则脚本/图片会被当成 HTML 解析）
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
				return;
			}
			// 无扩展名 → SPA fallback 到 index.html，由前端路由接管
			filePath = path.join(root, 'index.html');
		}

		fs.readFile(filePath, (err2, data) => {
			if (err2) {
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
				return;
			}
			const ext = path.extname(filePath).toLowerCase();
			const isHtml = ext === '.html';
			res.writeHead(200, {
				'Content-Type': MIME[ext] || 'application/octet-stream',
				// HTML 不缓存，带哈希名的静态资源长缓存
				'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable'
			});
			res.end(data);
		});
	});
});

server.on('error', (e) => {
	if (e.code === 'EADDRINUSE') {
		console.error(`端口 ${port} 已被占用，请换一个：node serve.js ${port + 1}`);
	} else {
		console.error('服务启动失败：', e.message);
	}
	process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
	const url = `http://127.0.0.1:${port}/`;
	console.log('');
	console.log('  原神抽卡模拟器 · 本地服务已启动');
	console.log('  ----------------------------------------');
	console.log(`  地址:  ${url}`);
	console.log(`  根目录: ${root}`);
	console.log('');
	console.log('  按 Ctrl+C 停止服务');
	console.log('');

	// 自动打开浏览器
	setTimeout(() => {
		if (process.platform === 'win32') {
			exec(`start "" "${url}"`);
		} else if (process.platform === 'darwin') {
			exec(`open "${url}"`);
		} else {
			exec(`xdg-open "${url}"`);
		}
	}, 500);
});
