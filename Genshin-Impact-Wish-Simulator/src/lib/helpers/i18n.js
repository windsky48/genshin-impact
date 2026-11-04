import { browser } from '$app/environment';
import { init, register, getLocaleFromNavigator } from 'svelte-i18n';
import { localConfig } from './dataAPI/api-localstore';

const supportedLocales = [
	'zh-CN',
	'zh-TW',
	'de-DE',
	'en-US',
	'fr-FR',
	'id-ID',
	'it-IT',
	'ja-JP',
	'pt-BR',
	'ru-RU',
	'th-TH',
	'vi-VN'
];
const itemLocales = ['zh-CN', 'zh-TW', 'en-US', 'it-IT', 'ja-JP', 'pt-BR', 'ru-RU', 'vi-VN'];

const checkLocale = () => {
	const savedLocale = browser ? localConfig.get('locale') : null;
	const browserLocale = savedLocale || getLocaleFromNavigator();
	const usedLocale = supportedLocales.find((langID) => langID.includes(browserLocale));
	return usedLocale || 'en-US';
};

const mountLocale = () => {
	supportedLocales.forEach((langID) => {
		register(langID, () => import(`../../locales/${langID}.json`));
	});

	itemLocales.forEach((langID) => {
		register(langID, () => import(`../../locales/items/${langID}.json`));
	});

	// 名单管理 / 预设名单的文案单独放一份小字典。
	// svelte-i18n 对同一个 locale 注册多个 loader 时会做深合并，
	// 所以不用把这两百多行塞进 35~60KB 的大语言文件里。
	supportedLocales.forEach((langID) => {
		register(langID, () => import(`../../locales/roster/${langID}.json`));
	});

	const usedLocale = checkLocale();
	init({
		fallbackLocale: 'en-US',
		initialLocale: usedLocale
	});
};

export { mountLocale, checkLocale };
