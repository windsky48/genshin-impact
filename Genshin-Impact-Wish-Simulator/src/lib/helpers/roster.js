import { memberList } from '$lib/store/app-stores';
import { localMemberList, localConfig, storageLocal } from './dataAPI/api-localstore';

/**
 * 名单（点名）管理
 *
 * 原版只能在 .txt 里用「星级 空格 名字」标注星级，界面上看不到也改不了，
 * 而且名单抽卡是等概率的（星级只影响奖励类型）。
 * 这里补上：界面上逐条设置星级 + 星级参与抽取概率。
 */

/** 可选星级 */
export const RARITIES = [5, 4, 3];

/** 各星级的抽取权重（数值越小越稀有） */
export const RARITY_WEIGHT = {
	5: 1,
	4: 5,
	3: 20
};

/**
 * 是否按星级加权抽取（默认开，可在名单管理面板里关掉回到等概率）
 * 注意：localConfig.get() 对 false 会返回 {}（真值），布尔开关必须直接读原始数据
 */
export const isWeightedEnabled = () => {
	const { data = {} } = storageLocal.getData();
	return data.memberRarityWeight !== false;
};

/** 设置是否按星级加权抽取 */
export const setWeightedEnabled = (enabled) => {
	localConfig.set('memberRarityWeight', !!enabled);
	return !!enabled;
};

/** 持久化一份名单并同步 store */
export const saveMembers = (list) => {
	const members = Array.isArray(list) ? list : [];
	localMemberList.set(members);
	memberList.set(members);
	return members;
};

/**
 * 当前名单
 * Svelte 3 没有 get()（那是 Svelte 4），这里用订阅的方式保持一份本地引用，
 * 与 member-loader.js 里对 memberDB 的处理方式一致。
 */
let currentMembers = [];
memberList.subscribe((v) => {
	currentMembers = Array.isArray(v) ? v : [];
});

export const getMembers = () => currentMembers;

/**
 * 设置某一条的星级
 * @param {string} key 名单项的唯一键（member.name）
 * @param {number} rarity 3 | 4 | 5
 */
export const setMemberRarity = (key, rarity) => {
	const list = getMembers().map((m) =>
		m.name === key ? { ...m, rarity: Number(rarity) } : m
	);
	return saveMembers(list);
};

/**
 * 删除某一条
 * @param {string} key 名单项的唯一键（member.name）
 */
export const removeMember = (key) => {
	const list = getMembers().filter((m) => m.name !== key);
	return saveMembers(list);
};

/**
 * 添加一条
 * @param {string} name 名字
 * @param {number} rarity 3 | 4 | 5
 */
export const addMember = (name, rarity = 3) => {
	const trimmed = String(name || '').trim();
	if (!trimmed) return getMembers();

	const list = [...getMembers()];
	list.push({
		name: `p-${list.length}-${Date.now().toString(36)}`,
		chineseChar: trimmed,
		rarity: Number(rarity) || 3
	});
	return saveMembers(list);
};

/**
 * 把整份名单统一设为某个星级
 * @param {number} rarity 3 | 4 | 5
 */
export const setAllRarity = (rarity) => {
	const list = getMembers().map((m) => ({ ...m, rarity: Number(rarity) }));
	return saveMembers(list);
};

/**
 * 按星级分组统计
 * @param {Array} members 名单
 */
export const groupByRarity = (members) => {
	const list = Array.isArray(members) ? members : [];
	return {
		5: list.filter((m) => m.rarity === 5),
		4: list.filter((m) => m.rarity === 4),
		3: list.filter((m) => m.rarity === 3)
	};
};

/**
 * 某一条的抽取权重
 * @param {object} member 名单项
 * @param {boolean} weighted 是否按星级加权
 */
export const memberWeight = (member, weighted = true) => {
	if (!weighted) return 1;
	return RARITY_WEIGHT[member?.rarity] ?? RARITY_WEIGHT[3];
};
