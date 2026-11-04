import { get3StarItem, getMemberItem, rand } from './itemdrop-base';
import { prob } from './probabilities';

const memberWish = {
    init({ stdver, version, phase }) {
        this._stdver = stdver;
		this._version = version;
		this._phase = phase;
		return this;
    },

    get(rarity) {
        const dropList = getMemberItem();
		if (!dropList || !dropList.length) return {};

		// 按名单里设置的星级加权抽取（所有权重相同即等价于等概率）
		const weighted = dropList.some((item) => item.chance !== 1);
		return weighted ? prob(dropList) : rand(dropList);
    }
};

export default memberWish;