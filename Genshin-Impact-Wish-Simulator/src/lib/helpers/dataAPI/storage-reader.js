import { storageVersion, version as siteVersion, wishPhase } from '$lib/data/wish-setup.json';
import {
	autoskip,
	beginnerRemaining,
	wishAmount,
	primogem,
	acquaint,
	stardust,
	genesis,
	starglitter,
	intertwined,
	multipull,
	preloadVersion,
	memberList
} from '$lib/store/app-stores';
import { localBalance, rollCounter, localConfig, localMemberList } from './api-localstore';
import { noticeMark } from '../noticeMark';
import { memberDB } from '../member-loader';
import { data as defaultMembers } from '$lib/data/members.json';

/**
 * Read Balance From LocalStorage
 * @param null
 */
export const importLocalConfig = () => {
	const {
		primogem: pr,
		intertwined: iw,
		acquaint: ac,
		genesis: gs,
		stardust: sd,
		starglitter: sg
	} = localBalance.all() || {};
	if (!isNaN(pr)) primogem.set(pr);
	if (!isNaN(ac)) acquaint.set(ac);
	if (!isNaN(iw)) intertwined.set(iw);
	if (!isNaN(gs)) genesis.set(gs);
	stardust.set(isNaN(sd) ? 0 : sd);
	starglitter.set(isNaN(sg) ? 0 : sg);

	const lWishAmount = localConfig.get('wishAmount') || 'default';
	wishAmount.set(lWishAmount);
	console.log('Balance Updated');

	const starterRollCount = rollCounter.get('beginner') || 0;
	beginnerRemaining.set(20 - starterRollCount);

	const lAutoSkip = localConfig.get('autoskip') || false;
	autoskip.set(lAutoSkip);

	noticeMark.onLoadCheck();

	const lMulti = localConfig.get('multipull');
	multipull.set(lMulti || 10);

	const lMemberList = localMemberList.get();
	// 从没设置过名单时 localMemberList.get() 返回 {}（不是数组）→ 用内置默认名单；
	// 用户主动清空过的话存的是 []，尊重用户操作，保持空名单。
	memberList.set(Array.isArray(lMemberList) ? lMemberList : defaultMembers);
};

/**
 * Set Banner Version And Phase base on user Storage
 * @param null
 */
export const setBannerVersionAndPhase = () => {
	const localstoreVersion = localConfig.get('storageVersion');
	const localVersion = localConfig.get('version') || '';
	let [patch, phase] = localVersion.split('-');

	if (localstoreVersion !== storageVersion) {
		localConfig.set('version', `${siteVersion}-${wishPhase}`);
		localConfig.set('storageVersion', storageVersion);
		[patch, phase] = [siteVersion, wishPhase];
	}
	preloadVersion.set({ patch: patch, phase: parseInt(phase) });

	console.log(`Banner version set to ${patch} phase ${phase}`);
};
