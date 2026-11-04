/**
 * 零依赖 Chrome DevTools Protocol 驱动
 * Node 22 自带全局 WebSocket，不需要 puppeteer/playwright
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port = 9333, width = 458, height = 900 } = {}) {
	const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-profile-'));
	const proc = spawn(
		CHROME,
		[
			'--headless=new',
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${userDataDir}`,
			`--window-size=${width},${height}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-gpu',
			'--hide-scrollbars',
			'--autoplay-policy=no-user-gesture-required',
			'--disable-features=Translate,MediaRouter',
			'about:blank'
		],
		{ stdio: 'ignore', detached: false }
	);

	// 等待调试端口就绪
	let wsUrl = null;
	for (let i = 0; i < 60; i++) {
		await sleep(300);
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`, { proxy: '' });
			const json = await res.json();
			wsUrl = json.webSocketDebuggerUrl;
			if (wsUrl) break;
		} catch {
			/* 还没起来 */
		}
	}
	if (!wsUrl) {
		proc.kill();
		throw new Error('Chrome 调试端口未就绪');
	}

	return {
		port,
		proc,
		userDataDir,
		async close() {
			try {
				proc.kill();
			} catch {
				/* ignore */
			}
			try {
				rmSync(userDataDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	};
}

export class CDP {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		this.listeners = new Map();
		ws.addEventListener('message', (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
			} else if (msg.method) {
				(this.listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
			}
		});
	}

	static async connect(url) {
		const ws = new WebSocket(url);
		await new Promise((resolve, reject) => {
			ws.addEventListener('open', resolve, { once: true });
			ws.addEventListener('error', reject, { once: true });
		});
		return new CDP(ws);
	}

	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					reject(new Error(`${method} 超时`));
				}
			}, 30000);
		});
	}

	on(method, fn) {
		if (!this.listeners.has(method)) this.listeners.set(method, []);
		this.listeners.get(method).push(fn);
	}

	/**
	 * 自动处理原生弹窗（alert / confirm / prompt）。
	 * 必须处理：headless 下 alert 会阻塞页面 JS，导致后续 evaluate 全部超时。
	 */
	autoDismissDialogs(action = 'accept') {
		this.on('Page.javascriptDialogOpening', async (p) => {
			this.lastDialog = { type: p.type, message: p.message };
			try {
				await this.send('Page.handleJavaScriptDialog', { accept: action === 'accept' });
			} catch {
				/* ignore */
			}
		});
	}

	async eval(expression) {
		const r = await this.send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true
		});
		if (r.exceptionDetails) {
			throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
		}
		return r.result.value;
	}

	async screenshot(file, { fullPage = false } = {}) {
		const r = await this.send('Page.captureScreenshot', {
			format: 'png',
			captureBeyondViewport: fullPage
		});
		const { writeFileSync } = await import('node:fs');
		writeFileSync(file, Buffer.from(r.data, 'base64'));
		return file;
	}

	async click(selector) {
		const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
    })()`);
		if (!box) throw new Error('找不到元素: ' + selector);
		await this.send('Input.dispatchMouseEvent', {
			type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1
		});
		await this.send('Input.dispatchMouseEvent', {
			type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1
		});
		return box;
	}

	async clickText(text, tag = 'button') {
		const box = await this.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(tag)})];
      const el = els.find(e => (e.textContent||'').includes(${JSON.stringify(text)}));
      if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })()`);
		if (!box) throw new Error('找不到按钮: ' + text);
		await this.send('Input.dispatchMouseEvent', {
			type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1
		});
		await this.send('Input.dispatchMouseEvent', {
			type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1
		});
		return box;
	}

	async setFileInput(selector, filePath) {
		// CDP: DOM.setFileInputFiles —— 走真实的 <input type="file"> 提交流程
		const doc = await this.send('DOM.getDocument', { depth: -1 });
		const node = await this.send('DOM.querySelector', {
			nodeId: doc.root.nodeId,
			selector
		});
		if (!node.nodeId) throw new Error('找不到文件输入框: ' + selector);
		await this.send('DOM.setFileInputFiles', {
			nodeId: node.nodeId,
			files: [filePath]
		});
	}

	async waitFor(expression, { timeout = 30000, interval = 400 } = {}) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			try {
				const v = await this.eval(expression);
				if (v) return v;
			} catch {
				/* 页面还没就绪 */
			}
			await sleep(interval);
		}
		throw new Error('等待超时: ' + expression);
	}
}

export async function openPage(port, url) {
	const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
		method: 'PUT',
		proxy: ''
	});
	const target = await res.json();
	const cdp = await CDP.connect(target.webSocketDebuggerUrl);
	await cdp.send('Page.enable');
	await cdp.send('Runtime.enable');
	await cdp.send('DOM.enable');
	return { cdp, targetId: target.id };
}

export { sleep };
