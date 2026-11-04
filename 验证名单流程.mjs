/**
 * 端到端验证：名单上传 → member 卡池抽卡
 * 走真实的 <input type="file"> 上传流程（CDP DOM.setFileInputFiles）
 */
import { launchChrome, openPage, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:8099';
const ROSTER = path.join(__dirname, '示例名单.txt');
const OUT = path.join(__dirname, '验证截图');
const log = (...a) => console.log(...a);

const chrome = await launchChrome({ port: 9333, width: 458, height: 900 });
log('✓ Chrome headless 已启动');

try {
	const { cdp } = await openPage(9333, BASE + '/');
	cdp.autoDismissDialogs('accept');
	log('✓ 页面已打开，等待应用启动…');

	// 等待应用完成 hydrate（标题变化 + loader 消失）
	await cdp.waitFor(`document.title.includes('祈愿') || document.title.includes('Wish')`, { timeout: 30000 });
	log('  标题:', await cdp.eval('document.title'));

	// 等 888 张图片转 blob 完成
	await cdp.waitFor(`!document.body.innerText.includes('Connecting')`, { timeout: 90000 }).catch(
		() => log('  ! 仍在加载（Connecting），继续')
	);
	await sleep(3000);

	// 关掉首次访问的欢迎弹窗
	const dismissed = await cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /close|Close|OK|开始|Continue/i.test(x.textContent||''));
    if (b) { b.click(); return b.textContent.trim(); }
    return null;
  })()`);
	if (dismissed) log('  关闭欢迎弹窗:', dismissed);
	await sleep(1500);

	log('\n--- 第一步：点击左上角问号（设置）---');
	await cdp.click('button.help');
	await sleep(2500);
	log('  菜单已打开:', await cdp.eval(`document.body.innerText.includes('名单') || document.body.innerText.includes('上传')`));

	// 截图：菜单
	await cdp.screenshot(path.join(OUT, '01-设置菜单.png'));
	log('  截图: 01-设置菜单.png');

	log('\n--- 第二步：定位名单文件输入框 ---');
	const fileInput = await cdp.eval(`(() => {
    const el = document.querySelector('#fileInput') || document.querySelector('input[type=file]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { id: el.id, accept: el.accept, visible: r.width > 0 && r.height > 0, w: r.width, h: r.height };
  })()`);
	log('  文件输入框:', JSON.stringify(fileInput));

	if (!fileInput) throw new Error('找不到文件输入框');

	log('\n--- 第三步：上传名单文件（真实 file input 流程）---');
	await cdp.setFileInput('#fileInput', ROSTER);
	log('  已设置文件:', ROSTER);

	const fileState = await cdp.eval(`(() => {
    const el = document.querySelector('#fileInput');
    return { files: el.files ? el.files.length : -1, name: el.files && el.files[0] ? el.files[0].name : null };
  })()`);
	log('  input.files 状态:', JSON.stringify(fileState));

	await sleep(1200);

	// 关键：输入框本身没有 change 处理器，靠旁边的「上传」按钮触发 handleUpload()
	log('  点击「上传」按钮…');
	const uploaded = await cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => (x.textContent||'').trim() === '上传');
    if (!b) return 'not-found; 按钮: ' + JSON.stringify(btns.map(x=>(x.textContent||'').trim()).filter(Boolean).slice(0,20));
    b.click();
    return 'clicked 上传';
  })()`);
	log('  ', uploaded);

	// 等 FileReader 完成
	await sleep(3000);

	// 验证 localStorage
	const stored = await cdp.eval(`(() => {
    const raw = localStorage.getItem('WishSimulator.App');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const m = parsed.data && parsed.data.members;
    return m ? { count: m.length, first: m[0], last: m[m.length-1] } : null;
  })()`);
	log('  localStorage 名单:', JSON.stringify(stored));
	log('  弹窗提示:', cdp.lastDialog ? cdp.lastDialog.message : '(无)');

	log('\n--- 第四步：关闭菜单 → 切到 member 卡池 → 抽卡 ---');
	// 菜单是模态层，会挡住后面的点击，先用 Esc 关掉
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
	});
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
	});
	await sleep(2000);
	const menuClosed = await cdp.eval(`!document.body.innerText.includes('导入名单')`);
	log('  菜单已关闭:', menuClosed);
	await cdp.screenshot(path.join(OUT, '03-主界面.png'));

	// member 卡池按钮：<button class="button member">
	const switched = await cdp.eval(`(() => {
    const b = document.querySelector('button.button.member');
    if (!b) return 'not-found';
    b.click();
    return 'clicked member banner';
  })()`);
	log('  切换卡池:', switched);
	await sleep(3000);

	const curType = await cdp.eval(`(() => {
    const act = document.querySelector('button.button.active');
    const t = (document.body.innerText||'').replace(/\\s+/g,' ');
    return { active: act ? act.className : '(无)', 页面: t.slice(0, 160) };
  })()`);
	log('  当前卡池:', curType.active);
	log('  页面:', curType.页面);
	await cdp.screenshot(path.join(OUT, '04-member卡池.png'));

	// 点击「祈愿 ×1」
	const wished = await cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /祈愿\\s*×\\s*1(?!\\d)/.test((x.textContent||'').replace(/\\s+/g,' ').trim()));
    if (b) { b.click(); return b.textContent.trim(); }
    return 'not-found; 按钮文本: ' + JSON.stringify(btns.map(x=>(x.textContent||'').replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,15));
  })()`);
	log('  点击祈愿按钮:', wished);
	await sleep(9000);

	const result = await cdp.eval(`(() => {
    const t = document.body.innerText || '';
    const hit = ['夜兰','纳西妲','妮露','砂糖','白术','烟绯','安柏','凯亚','芭芭拉'].filter(n => t.includes(n));
    return { 命中名单项: hit, 片段: t.replace(/\\s+/g,' ').slice(0, 300) };
  })()`);
	log('  抽卡结果命中名单项:', JSON.stringify(result.命中名单项));
	log('  页面片段:', result.片段);

	await cdp.screenshot(path.join(OUT, '02-名单抽卡结果.png'));
	log('  截图: 02-名单抽卡结果.png');
} catch (e) {
	log('\n✗ 失败:', e.message);
} finally {
	await chrome.close();
	log('\n✓ 已关闭 Chrome');
}
