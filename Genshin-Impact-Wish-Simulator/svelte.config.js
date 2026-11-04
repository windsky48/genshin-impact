import path from 'path';
import adapter from '@sveltejs/adapter-vercel';
import preprocess from 'svelte-preprocess';

/**
 * BASE_PATH —— 部署到子目录时使用。
 *   根目录部署（EdgeOne Pages 默认域名 / 自定义域名）→ 留空
 *   部署到 https://example.com/genshin/             → BASE_PATH=/genshin
 * 注意：末尾不要带斜杠。
 */
const base = (process.env.BASE_PATH || '').replace(/\/$/, '');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		appDir: 'internal',
		adapter: adapter(),
		paths: {
			base
		},
		alias: {
			$post: path.resolve('./src/post')
		}
	},
	preprocess: preprocess({ postcss: true })
};

export default config;
