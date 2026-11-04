const rawHost = (import.meta.env.VITE_HOST || '').trim();
// 域名没写协议时补上 https://。
// 否则 og:image / fluid-icon 会退化成相对路径（如 genshin.wisas.link/meta-picture.jpg），
// SvelteKit 预渲染会把它当站内资源去抓，404 直接让整个构建失败。
const host = rawHost && !/^https?:\/\//i.test(rawHost) ? `https://${rawHost}` : rawHost;
export const HOST = host.replace(/^\/|\/$/g, '');

export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'Genshin Impact Wish Simulator';
export const DESCRIPTION = import.meta.env.VITE_DESCRIPTION || '';
export const KEYWORDS = import.meta.env.VITE_KEYWORDS || '';

// API
const apihost = import.meta.env.VITE_API_HOST || '';
export const API_HOST = apihost.replace(/^\/|\/$/g, '');
export const IBB_KEY = import.meta.env.VITE_IBB_KEY || '';

export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
