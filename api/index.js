const crypto = require('crypto');

const sessions = new Map();
const checks = new Map();

function send(response, status, body, cookie) {
	response.statusCode = status;
	response.setHeader('Content-Type', 'application/json');
	if (cookie) response.setHeader('Set-Cookie', cookie);
	response.end(JSON.stringify(body));
}

function parseCookies(request) {
	return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => {
		const [key, ...value] = part.trim().split('=');
		return [key, decodeURIComponent(value.join('='))];
	}));
}

function userFrom(request) {
	const userId = sessions.get(parseCookies(request).pashuraksha_session);
	return userId ? { id: userId, email: userId, displayName: userId.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), language: 'mr', profileComplete: true } : null;
}

function resultFor(input) {
	let score = 0;
	if (Number(input.temperature) >= 39.5) score += 45;
	else if (Number(input.temperature) >= 39) score += 20;
	if (input.appetite === 'reduced') score += 20;
	if (input.appetite === 'none') score += 35;
	if (input.behavior === 'quiet') score += 10;
	if (input.behavior === 'lethargic') score += 25;
	if (input.symptoms) score += 20;
	const riskLevel = score >= 60 ? 'High' : score >= 25 ? 'Medium' : 'Low';
	const recommendation = riskLevel === 'High' ? 'Contact a qualified veterinarian promptly. This is preliminary AI guidance, not a diagnosis.' : riskLevel === 'Medium' ? 'Monitor the animal closely and seek veterinary advice if symptoms continue.' : 'Continue routine care and monitor for changes.';
	return { riskLevel, riskScore: Math.min(score, 100), recommendation, reasons: [] };
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		let body = '';
		request.on('data', (chunk) => { body += chunk; if (body.length > 20000) reject(new Error('Request is too large')); });
		request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON payload')); } });
		request.on('error', reject);
	});
}

module.exports = async function handler(request, response) {
	const path = new URL(request.url, 'https://pashuraksha.local').pathname;
	try {
		if (request.method === 'GET' && path.endsWith('/auth/session')) {
			const user = userFrom(request);
			return send(response, 200, user ? { authenticated: true, user } : { authenticated: false });
		}
		if (request.method === 'POST' && path.endsWith('/auth/login')) {
			const body = await readBody(request);
			const email = String(body.email || '').trim().toLowerCase();
			const password = String(body.password || '');
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) return send(response, 400, { error: 'Enter a valid email and a password of at least 6 characters.' });
			const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, email);
			return send(response, 200, { user: { email, displayName: email.split('@')[0], language: 'mr', profileComplete: true } }, `pashuraksha_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
		}
		if (request.method === 'POST' && path.endsWith('/auth/logout')) {
			const token = parseCookies(request).pashuraksha_session; sessions.delete(token);
			return send(response, 200, { ok: true }, 'pashuraksha_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
		}
		if (path.endsWith('/chat') && request.method === 'POST') {
			const body = await readBody(request); const language = String(body.language || 'en');
			const replies = { mr: 'Health Check उघडा आणि प्राण्याचे तापमान, भूक, वर्तन आणि लक्षणे भरा. ही प्राथमिक AI मार्गदर्शक माहिती आहे, निदान नाही.', hi: 'Health Check खोलें और तापमान, भूख, व्यवहार और लक्षण भरें। यह प्राथमिक AI मार्गदर्शन है, निदान नहीं।', en: 'Open Health Check and enter temperature, appetite, behavior, and symptoms. This is preliminary AI guidance, not a diagnosis.' };
			return send(response, 200, { reply: replies[language] || replies.en, language });
		}
		if (!userFrom(request)) return send(response, 401, { error: 'Authentication required' });
		if (request.method === 'GET' && path.endsWith('/dashboard')) return send(response, 200, { stats: { total: 0, healthy: 0, medium: 0, high: 0 }, reports: [], chart: { healthy: 0, medium: 0, high: 0 } });
		if (request.method === 'GET' && path.endsWith('/health-checks')) return send(response, 200, { records: checks.get(userFrom(request).id) || [] });
		if (request.method === 'POST' && path.endsWith('/health-checks')) {
			const body = await readBody(request); const result = resultFor(body); const user = userFrom(request); const record = { id: Date.now(), ...body, risk_level: result.riskLevel, risk_score: result.riskScore, recommendation: result.recommendation, created_at: new Date().toISOString() };
			checks.set(user.id, [...(checks.get(user.id) || []), record]); return send(response, 201, { id: record.id, input: body, result });
		}
		return send(response, 404, { error: 'API route not found' });
	} catch (error) { return send(response, 400, { error: error.message || 'Request failed' }); }
};