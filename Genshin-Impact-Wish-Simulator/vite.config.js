import path from 'path';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { plugin as MdPlugin } from 'vite-plugin-markdown';
import { config as envConfig } from 'dotenv';

envConfig();
// .env 被 gitignore 了（本地私有），.env.production 是提交进仓库的构建默认值。
// dotenv 默认不覆盖已存在的值，所以本地 .env 优先，平台环境变量又优先于两者。
envConfig({ path: '.env.production' });
const { VITE_APP_TITLE, VITE_DESCRIPTION, VITE_HOST } = process.env;

/**
 * imagetools 依赖 sharp，而 sharp 的原生二进制要从 GitHub Releases 下载。
 * 在网络受限的构建环境（比如国内 CI）里这一步会失败，导致整个构建挂掉。
 * 这里先探测 sharp 能不能真正加载，探测失败就跳过图片优化 —— 只影响图片压缩率，不影响功能。
 */
const imagetoolsPlugins = [];
try {
	const { imagetools } = await import('vite-imagetools');
	await import('sharp'); // 加载原生绑定，失败会抛错
	imagetoolsPlugins.push(imagetools());
} catch (e) {
	console.warn('[build] sharp 不可用，已跳过图片优化：', e.message);
}

// 与 svelte.config.js 保持一致：部署到子目录时使用
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');
const iconSize = [16, 32, 72, 96, 128, 144, 152, 192, 256, 384, 512];
const icons = iconSize.map((size) => {
	const iconObj = {
		src: `./icons/icon-${size}x${size}.png`,
		sizes: `${size}x${size}`,
		type: 'image/png'
	};
	if (size === 192) iconObj.purpose = 'maskable';
	if (size === 384) iconObj.purpose = 'any';
	return iconObj;
});

const screenshots = [
	{
		sizes: '591x1280',
		src: 'https://user-images.githubusercontent.com/13815468/200561929-52a32a57-bd2c-473c-b25d-dcd8877ce253.jpg',
		label: 'Section 1',
		type: 'image/jpg'
	},
	{
		sizes: '591x1280',
		src: 'https://user-images.githubusercontent.com/13815468/200561938-c8429695-d7fe-4cf2-8391-d3e78daa789c.jpg',
		label: 'Section 2',
		type: 'image/jpg'
	},
	{
		sizes: '591x1280',
		src: 'https://user-images.githubusercontent.com/13815468/200561909-2f965a06-6cdb-45a3-92c9-646546d514f8.jpg',
		label: 'Section 3',
		type: 'image/jpg'
	},
	{
		sizes: '591x1280',
		src: 'https://user-images.githubusercontent.com/13815468/200561919-b76b11e2-dbda-4534-845e-48714f60fc40.jpg',
		label: 'Section 4',
		type: 'image/jpg'
	}
];

const manifest = {
	orientation: 'landscape',
	name: VITE_APP_TITLE,
	description: VITE_DESCRIPTION,
	id: 'wishsimulator.app',
	short_name: 'WishSimulator.App',
	theme_color: '#ffffff',
	background_color: '#ffffff',
	display: 'fullscreen',
	display_override: [
		'fullscreen',
		'window-controls-overlay',
		'standalone',
		'minimal-ui',
		'browser'
	],
	scope: BASE_PATH || '/',
	scope_extensions: [{ origin: 'wishsimulator.app' }, { origin: 'wishsimulator.pages.dev' }],
	start_url: `${BASE_PATH || ''}/?pwasc=homescreen`,
	categories: ['games', 'utilities'],
	dir: 'auto',
	icons,
	screenshots,
	handle_links: 'preferred',
	prefer_related_applications: true,
	launch_handler: {
		client_mode: ['focus-existing', 'auto']
	},
	related_applications: [
		{
			platform: 'webapp',
			url: `${VITE_HOST}/appmanifest.json`
		},
		{
			platform: 'play',
			url: 'https://play.google.com/store/apps/details?id=twa.wishsimulator.app',
			id: 'twa.wishsimulator.app'
		}
	],
	edge_side_panel: {
		preferred_width: 412
	}
};

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [
		...imagetoolsPlugins,
		sveltekit(),
		MdPlugin({ mode: 'html' }),
		VitePWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			outDir: '.vercel/output/static',
			filename: 'sw.js',
			registerType: 'prompt',
			manifestFilename: 'appmanifest.json',
			manifest
		})
	],
	resolve: {
		alias: {
			$post: path.resolve(__dirname, './src/post'),
			'@images': path.resolve(__dirname, './src/images')
		}
	},
	build: {
		chunkSizeWarningLimit: 350,
		target: ['es2020']
	}
};

export default config;