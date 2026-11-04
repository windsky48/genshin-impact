/**
 * 端到端验证：预设名单功能
 * 菜单 → 预设名单 → 选择预设 → 名单卡池抽卡
 */
import { launchChrome, openPage, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, '验证截图');
const log = (...a) => console.log(...a);

const chrome = await launchChrome({ port: 9334, width: 480, height: 900 });
log('✓ Chrome headless 已启动');

try {
	const { cdp } = await openPage(9334, BASE + '/');
	cdp.autoDismissDialogs('accept');
	log('✓ 页面已打开，等待应用启动…');

	await cdp.waitFor(`document.title.includes('Wish') || document.title.includes('祈愿')`, { timeout: 30000 });
	await cdp.waitFor(`!document.body.innerText.includes('Connecting')`, { timeout: 90000 }).catch(
		() => log('  ! 仍在加载，继续')
	);
	await sleep(3000);
	log('  标题:', await cdp.eval('document.title'));

	log('\n--- 第一步：打开设置菜单 ---');
	await cdp.click('button.help');
	await sleep(2500);
	const hasPresetRow = await cdp.eval(`!!document.querySelector('.option-select.preset')`);
	log('  找到「预设名单」下拉:', hasPresetRow);
	await cdp.screenshot(path.join(OUT, '05-预设名单入口.png'));

	if (!hasPresetRow) throw new Error('菜单里没有找到预设名单下拉框');

	log('\n--- 第二步：展开预设列表 ---');
	await cdp.eval(`(() => {
    const sel = document.querySelector('.option-select.preset');
    sel.querySelector('button.selected').click();
    return true;
  })()`);
	await sleep(1200);
	const list = await cdp.eval(`(() => {
    const sel = document.querySelector('.option-select.preset');
    const drop = sel.querySelector('.select');
    if (!drop) return null;
    return [...drop.querySelectorAll('button')].map(b => (b.textContent||'').trim());
  })()`);
	log('  预设列表:', JSON.stringify(list));
	await cdp.screenshot(path.join(OUT, '06-预设列表.png'));

	log('\n--- 第三步：应用第一个预设 ---');
	const applied = await cdp.eval(`(() => {
    const sel = document.querySelector('.option-select.preset');
    const drop = sel.querySelector('.select');
    const btn = drop.querySelectorAll('button')[0];
    const label = (btn.textContent||'').trim();
    btn.click();
    return label;
  })()`);
	log('  已选择预设:', applied);
	await sleep(2500);

	const stored = await cdp.eval(`(() => {
    const raw = localStorage.getItem('WishSimulator.App');
    if (!raw) return null;
    const m = JSON.parse(raw).data && JSON.parse(raw).data.members;
    if (!m) return null;
    return {
      count: m.length,
      first3: m.slice(0,3).map(x => x.chineseChar + '(' + x.rarity + '★)'),
      stars: [5,4,3].map(r => r + '★' + m.filter(x=>x.rarity===r).length).join(' ')
    };
  })()`);
	log('  localStorage 名单:', JSON.stringify(stored));

	log('\n--- 第四步：关闭菜单 → 切名单卡池 → 抽卡 ---');
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
    const names = ${JSON.stringify(
		['夜兰','纳西妲','妮露','砂糖','白术','烟绯','安柏','凯亚','芭芭拉']
	)};
    return {
      命中: names.filter(n => t.includes(n)),
      片段: t.replace(/\\s+/g,' ').slice(0, 200)
    };
  })()`);
	log('  抽卡结果命中名单项:', JSON.stringify(result.命中));
	log('  页面:', result.片段);
	await cdp.screenshot(path.join(OUT, '07-预设名单抽卡结果.png'));
	log('  截图: 07-预设名单抽卡结果.png');

	// 第五步：测试「清空名单」
	log('\n--- 第五步：清空名单 ---');

	// 抽卡结果弹窗还开着会挡住界面 → 重载页面（名单存在 localStorage 里会保留）
	await cdp.send('Page.navigate', { url: BASE + '/' });
	await cdp.waitFor(`document.title.includes('Wish') || document.title.includes('祈愿')`, { timeout: 30000 });
	await cdp.waitFor(`!document.body.innerText.includes('Connecting')`, { timeout: 90000 }).catch(
		() => log('  ! 仍在加载，继续')
	);
	await sleep(3000);
	log('  重载后名单仍在:', await cdp.eval(`(() => {
    const raw = localStorage.getItem('WishSimulator.App');
    const m = raw ? (JSON.parse(raw).data||{}).members : null;
    return m ? m.length : 'null';
  })()`));

	await cdp.click('button.help');
	await sleep(2500);
	log('  菜单已打开:', await cdp.eval(`!!document.querySelector('.option-select.preset')`));
	await cdp.eval(`(() => {
    const sel = document.querySelector('.option-select.preset');
    sel.querySelector('button.selected').click();
    return true;
  })()`);
	await sleep(1200);
	const cleared = await cdp.eval(`(() => {
    const drop = document.querySelector('.option-select.preset .select');
    if (!drop) return 'no-dropdown';
    const btn = drop.querySelectorAll('button');
    const last = btn[btn.length-1];
    const label = (last.textContent||'').trim();
    last.click();
    return label;
  })()`);
	log('  已点击:', cleared);
	await sleep(2500);
	const after = await cdp.eval(`(() => {
    const raw = localStorage.getItem('WishSimulator.App');
    const m = raw ? (JSON.parse(raw).data||{}).members : null;
    return m ? m.length : 'null';
  })()`);
	log('  清空后名单长度:', after);
	await cdp.screenshot(path.join(OUT, '08-清空名单.png'));

	// 第六步：测试动态预设（五星角色）
	log('\n--- 第六步：动态预设「五星角色」 ---');
	await cdp.eval(`(() => {
    const sel = document.querySelector('.option-select.preset');
    sel.querySelector('button.selected').click();
    return true;
  })()`);
	await sleep(1200);
	const fiveStar = await cdp.eval(`(() => {
    const drop = document.querySelector('.option-select.preset .select');
    const btn = [...drop.querySelectorAll('button')].find(b => /5★\\s*characters|五星角色/.test(b.textContent||''));
    if (!btn) return 'not-found';
    const label = (btn.textContent||'').trim();
    btn.click();
    return label;
  })()`);
	log('  已选择:', fiveStar);
	await sleep(3000);
	const big = await cdp.eval(`(() => {
    const raw = localStorage.getItem('WishSimulator.App');
    const m = raw ? (JSON.parse(raw).data||{}).members : null;
    if (!m) return null;
    return {
      count: m.length,
      stars: [5,4,3].map(r => r + '★' + m.filter(x=>x.rarity===r).length).join(' '),
      first5: m.slice(0,5).map(x => x.chineseChar).join(', ')
    };
  })()`);
	log('  五星角色名单:', JSON.stringify(big));
	await cdp.screenshot(path.join(OUT, '09-五星角色预设.png'));
	log('  截图: 09-五星角色预设.png');
} catch (e) {
	log('\n✗ 失败:', e.message);
} finally {
	await chrome.close();
	log('\n✓ 已关闭 Chrome');
}
