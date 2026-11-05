/**
 * 端到端验证：默认名单（应用自带的那份）
 *
 * 用全新的浏览器 profile（临时 user-data-dir），确保 localStorage 是空的，
 * 模拟「用户第一次打开网站」的场景。
 */
import { launchChrome, openPage, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:8099';
const log = (...a) => console.log(...a);

// 默认名单（src/lib/data/members.json 里的内容）
const DEFAULT = ['夜兰', '纳西妲', '妮露', '砂糖', '白术', '烟绯', '安柏', '凯亚', '芭芭拉'];

const chrome = await launchChrome({ port: 9335, width: 480, height: 900 });
log('✓ Chrome headless 已启动（全新 profile，localStorage 为空）');

try {
	const { cdp } = await openPage(9335, BASE + '/');
	cdp.autoDismissDialogs('accept');
	await sleep(6000);
	await cdp.waitFor(`!document.body.innerText.includes('Connecting')`, { timeout: 90000 }).catch(
		() => log('  ! 仍在加载，继续')
	);
	await sleep(3000);
	log('  标题:', await cdp.eval('document.title'));

	log('\n--- 第一步：localStorage 是否为空（模拟首次访问）---');
	const raw = await cdp.eval(`localStorage.getItem('WishSimulator.App')`);
	log('  localStorage 原始内容:', raw === null ? 'null（全新用户）' : '有内容');

	log('\n--- 第二步：打开「名单管理」分区，看默认名单是否已就位 ---');
	await cdp.click('button.help');
	await sleep(2500);
	const sidebar = await cdp.eval(`[...document.querySelectorAll('.menu-item button')].map(b => b.textContent.trim())`);
	log('  侧栏:', JSON.stringify(sidebar));

	const opened = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('.menu-item button')].find(x => /名单管理|Roster/.test(x.textContent||''));
    if (!b) return false;
    b.click();
    return true;
  })()`);
	log('  进入「名单管理」:', opened);
	await sleep(2500);

	const panel = await cdp.eval(`(() => {
    const names = [...document.querySelectorAll('.row .name')].map(n => n.textContent.trim());
    const stars = [...document.querySelectorAll('.row .stars button')].map(b => b.textContent.trim());
    const summary = (document.querySelector('.summary')||{}).innerText || '';
    return { names, 星级按钮数: stars.length, summary: summary.replace(/\\s+/g,' ') };
  })()`);
	log('  面板里的名单:', JSON.stringify(panel.names));
	log('  名单人数:', panel.names.length, '| 星级按钮数:', panel.星级按钮数);
	log('  摘要:', panel.summary);

	log('\n--- 第三步：关菜单 → 切名单卡池 → 抽卡（应抽到默认名单里的人）---');
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
	});
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
	});
	await sleep(2000);

	await cdp.eval(`(() => { document.querySelector('button.button.member')?.click(); return true; })()`);
	await sleep(2500);
	await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /祈愿\\s*×\\s*1(?!\\d)/.test((x.textContent||'').replace(/\\s+/g,' ').trim()));
    if (b) b.click();
    return true;
  })()`);
	await sleep(9000);

	const result = await cdp.eval(`(() => {
    const t = document.body.innerText || '';
    return {
      命中: ${JSON.stringify(DEFAULT)}.filter(n => t.includes(n)),
      片段: t.replace(/\\s+/g,' ').slice(0, 140)
    };
  })()`);
	log('  抽卡结果命中默认名单项:', JSON.stringify(result.命中));
	log('  页面:', result.片段);

	log('\n--- 第四步：刷新后名单是否保留（应仍在 localStorage）---');
	await cdp.send('Page.navigate', { url: BASE + '/' });
	await sleep(7000);
	const afterReload = await cdp.eval(`(() => {
    const raw = localStorage.getItem('WishSimulator.App');
    if (!raw) return 'null';
    const m = JSON.parse(raw).data && JSON.parse(raw).data.members;
    return m ? { count: m.length, first: m[0] } : 'null';
  })()`);
	log('  刷新后 localStorage.members:', JSON.stringify(afterReload));

	const ok =
		panel.names.length === DEFAULT.length &&
		DEFAULT.every((n) => panel.names.includes(n)) &&
		result.命中.length > 0;
	log();
	log(ok ? '✓ 默认名单全部生效：首次访问即有名单 / 名单管理可见 / 抽卡命中名单成员' : '✗ 存在问题');
} catch (e) {
	log('\n✗ 失败:', e.message);
} finally {
	await chrome.close();
	log('\n✓ 已关闭 Chrome');
}
