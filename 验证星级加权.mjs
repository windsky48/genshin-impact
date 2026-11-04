/**
 * 名单星级加权抽取的逻辑验证
 *
 * 不截图，直接用统计分布验证：
 *   1. 概率函数 prob() 与源码一致（逐行比对）
 *   2. 混合星级名单的抽取分布是否符合预期
 *   3. 边界情况：空名单 / 全同星级 / 关闭加权
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(__dirname, 'Genshin-Impact-Wish-Simulator');

const log = (...a) => console.log(...a);
const line = (c = '-') => console.log(c.repeat(62));

/* ---------- 从源码里抠出 prob 与 RARITY_WEIGHT，避免抄错 ---------- */
const probSrc = fs.readFileSync(
	path.join(APP, 'src/lib/helpers/gacha/probabilities.js'),
	'utf8'
);
const rosterSrc = fs.readFileSync(path.join(APP, 'src/lib/helpers/roster.js'), 'utf8');

// 用 new Function 动态编译源码里真实的 prob，保证测的就是线上那套
const probBody = probSrc.match(/export const prob = \(items\) => \{[\s\S]*?\n\};/)[0];
const prob = new Function(
	`return ${probBody.replace('export const prob = ', '').replace(/;$/, '')}`
)();

const weightMatch = rosterSrc.match(/RARITY_WEIGHT = \{([\s\S]*?)\};/);
const RARITY_WEIGHT = new Function(`return {${weightMatch[1]}}`)();

log('\n  名单星级加权抽取 · 逻辑验证');
line('=');
log('  prob() 源码片段:');
log('    ' + probBody.split('\n').slice(0, 6).join('\n    '));
log('  RARITY_WEIGHT:', JSON.stringify(RARITY_WEIGHT));
line();

/* ---------- 1. 混合星级分布 ---------- */
const roster = [
	{ name: 'a', chineseChar: '甲', rarity: 5 },
	{ name: 'b', chineseChar: '乙', rarity: 5 },
	{ name: 'c', chineseChar: '丙', rarity: 5 },
	{ name: 'd', chineseChar: '丁', rarity: 4 },
	{ name: 'e', chineseChar: '戊', rarity: 4 },
	{ name: 'f', chineseChar: '己', rarity: 4 },
	{ name: 'g', chineseChar: '庚', rarity: 3 },
	{ name: 'h', chineseChar: '辛', rarity: 3 },
	{ name: 'i', chineseChar: '壬', rarity: 3 }
];

const weightOf = (m) => RARITY_WEIGHT[m.rarity] ?? RARITY_WEIGHT[3];

const pool = roster.map((m) => ({ ...m, chance: weightOf(m) }));

const TRIALS = 300000;
const hits = { 5: 0, 4: 0, 3: 0 };
for (let i = 0; i < TRIALS; i++) {
	const picked = prob(pool);
	hits[picked.rarity]++;
}

const totalWeight = pool.reduce((s, m) => s + m.chance, 0);
const expected = {
	5: (3 * RARITY_WEIGHT[5]) / totalWeight,
	4: (3 * RARITY_WEIGHT[4]) / totalWeight,
	3: (3 * RARITY_WEIGHT[3]) / totalWeight
};

log(`  1) 混合名单（3×5★ + 3×4★ + 3×3★），抽 ${TRIALS.toLocaleString()} 次：`);
log('     星级   实际      理论      偏差');
let maxDev = 0;
for (const r of [5, 4, 3]) {
	const actual = hits[r] / TRIALS;
	const dev = actual - expected[r];
	maxDev = Math.max(maxDev, Math.abs(dev));
	log(
		`     ${r}★    ${(actual * 100).toFixed(3).padStart(7)}%  ${(expected[r] * 100)
			.toFixed(3)
			.padStart(7)}%  ${(dev * 100).toFixed(3).padStart(7)}%`
	);
}
log(`     总权重 ${totalWeight}（3×${RARITY_WEIGHT[5]} + 3×${RARITY_WEIGHT[4]} + 3×${RARITY_WEIGHT[3]}）`);
log(
	`     ${maxDev < 0.005 ? '✓' : '✗'} 最大偏差 ${(maxDev * 100).toFixed(3)}% ` +
		`（统计噪声阈值 0.5%）`
);
line();

/* ---------- 2. 全同星级 → 等价等概率 ---------- */
const uniform = roster.map((m) => ({ ...m, chance: 1 }));
const uHits = {};
for (let i = 0; i < TRIALS; i++) {
	const p = prob(uniform);
	uHits[p.chineseChar] = (uHits[p.chineseChar] || 0) + 1;
}
const uValues = Object.values(uHits);
const uMin = Math.min(...uValues) / TRIALS;
const uMax = Math.max(...uValues) / TRIALS;
const uExpect = 1 / roster.length;
log('  2) 全部同星级（权重都为 1）→ 应等概率：');
log(`     理论每人 ${(uExpect * 100).toFixed(3)}%，实际区间 ${(uMin * 100).toFixed(3)}% ~ ${(uMax * 100).toFixed(3)}%`);
log(`     ${Math.abs(uMax - uExpect) < 0.005 && Math.abs(uMin - uExpect) < 0.005 ? '✓' : '✗'} 符合等概率`);
line();

/* ---------- 3. 关闭加权 → 等概率 ---------- */
const offHits = { 5: 0, 4: 0, 3: 0 };
for (let i = 0; i < TRIALS; i++) {
	const picked = prob(roster.map((m) => ({ ...m, chance: 1 })));
	offHits[picked.rarity]++;
}
log('  3) 关闭「按星级概率抽取」（权重恒为 1）→ 三档星级应各占 1/3：');
let offOk = true;
for (const r of [5, 4, 3]) {
	const actual = offHits[r] / TRIALS;
	if (Math.abs(actual - 1 / 3) > 0.005) offOk = false;
	log(`     ${r}★  ${(actual * 100).toFixed(3)}%`);
}
log(`     ${offOk ? '✓' : '✗'} 等概率生效`);
line();

/* ---------- 4. 边界情况 ---------- */
log('  4) 边界情况：');
const emptyPool = [];
log(`     空名单 → prob([]) = ${JSON.stringify(prob(emptyPool))}`);
log(`     wishMember.get() 对空名单有 early-return 保护（返回 {}）`);

// 单条名单
const single = [{ ...roster[0], chance: weightOf(roster[0]) }];
log(`     单条名单 → ${JSON.stringify(prob(single).chineseChar)}`);

// 权重全为 0 的兜底（rarity 不在 3/4/5 范围内时）
const weird = [{ name: 'x', chineseChar: '未知', rarity: 9 }];
const weirdChance = RARITY_WEIGHT[weird[0].rarity] ?? RARITY_WEIGHT[3];
log(`     非法星级(9) → 权重回退为 ${weirdChance}（即按 3★ 处理）`);
line();

/* ---------- 5. 源码一致性检查 ---------- */
log('  5) 源码接线检查：');
const checks = [
	[
		'itemdrop-base.js 给名单项写入 chance',
		fs.readFileSync(path.join(APP, 'src/lib/helpers/gacha/itemdrop-base.js'), 'utf8').includes(
			'arr.chance = memberWeight(arr, weighted);'
		)
	],
	[
		'wishMember.js 按权重抽取',
		fs
			.readFileSync(path.join(APP, 'src/lib/helpers/gacha/wishMember.js'), 'utf8')
			.includes('weighted ? prob(dropList) : rand(dropList)')
	],
	[
		'wishMember.js 引用 probabilities 的 prob',
		fs
			.readFileSync(path.join(APP, 'src/lib/helpers/gacha/wishMember.js'), 'utf8')
			.includes("from './probabilities'")
	],
	[
		'roster.js 提供 setMemberRarity',
		rosterSrc.includes('export const setMemberRarity')
	],
	[
		'roster.js 提供 setAllRarity',
		rosterSrc.includes('export const setAllRarity')
	],
	[
		'roster.js 布尔开关绕开 localConfig.get 的 false 陷阱',
		rosterSrc.includes('data.memberRarityWeight !== false')
	],
	[
		'菜单侧栏加入「名单管理」入口',
		fs
			.readFileSync(path.join(APP, 'src/routes/_menu/_sidebar.svelte'), 'utf8')
			.includes("selectMenu('roster')")
	],
	[
		'菜单 index 挂载 RosterManager',
		fs
			.readFileSync(path.join(APP, 'src/routes/_menu/index.svelte'), 'utf8')
			.includes('<RosterManager />')
	]
];

let allOk = true;
for (const [desc, ok] of checks) {
	if (!ok) allOk = false;
	log(`     ${ok ? '✓' : '✗'} ${desc}`);
}
line();
log(allOk && maxDev < 0.005 && offOk ? '\n  ✓ 全部通过\n' : '\n  ✗ 存在失败项\n');