import charsDB from '$lib/data/characters.json';
import weaponsDB from '$lib/data/weapons.json';
import presetRosterData from '$lib/data/preset-rosters.json';
import { saveMembers } from './roster';

/**
 * 预设名单（点名器）
 *
 * 与「导入名单」写入的是同一份数据（localStorage → WishSimulator.App.data.members），
 * 所以预设名单和上传的名单可以互相覆盖，行为完全一致。
 *
 * 名单项格式与 member-loader.js 保持一致：
 *   { name: '唯一键', chineseChar: '显示名', rarity: 3|4|5 }
 */

/** 预设列表（元信息，成员在 buildPresetMembers 里按需生成） */
export const presetRosters = presetRosterData.presets;

/** 根据 id 找预设 */
export const findPreset = (id) => presetRosters.find((p) => p.id === id);

/**
 * 生成预设名单的成员数组
 * @param {object} preset 预设定义
 * @param {Function} translate i18n 翻译函数（组件里传 $t）
 * @returns {Array} 成员数组
 */
export const buildPresetMembers = (preset, translate) => {
	if (!preset) return [];

	// 手写名单：名字已经是最终显示名
	if (preset.source === 'static') {
		return preset.members.map((member, idx) => ({
			name: `p-${idx}`,
			chineseChar: member.name,
			rarity: member.rarity
		}));
	}

	const db = preset.source === 'weapons' ? weaponsDB.data : charsDB.data;

	return db
		.filter((item) => !preset.rarity || item.rarity === preset.rarity)
		.map((item, idx) => ({
			name: `p-${idx}`,
			// 角色在 items 语言包里是 { name, title }，武器是纯字符串
			chineseChar:
				preset.source === 'weapons' ? translate(item.name) : translate(`${item.name}.name`),
			rarity: item.rarity
		}));
};

/**
 * 应用一个预设名单：写入本地存储并同步到 memberList store
 * @param {string} id 预设 id
 * @param {Function} translate i18n 翻译函数
 * @returns {Array} 应用后的成员数组
 */
export const applyPresetRoster = (id, translate) => {
	const preset = findPreset(id);
	const members = buildPresetMembers(preset, translate);

	// 写入本地存储并同步 memberList store（member-loader.js 里的 memberDB 订阅了它）
	return saveMembers(members);
};

/**
 * 清空名单
 * @returns {Array} 空数组
 */
export const clearRoster = () => saveMembers([]);

/**
 * 当前名单的摘要（用于设置菜单展示）
 * @param {Array} members 名单
 * @returns {object} { count, five, four, three }
 */
export const rosterSummary = (members) => {
	const list = Array.isArray(members) ? members : [];
	return {
		count: list.length,
		five: list.filter((m) => m.rarity === 5).length,
		four: list.filter((m) => m.rarity === 4).length,
		three: list.filter((m) => m.rarity === 3).length
	};
};