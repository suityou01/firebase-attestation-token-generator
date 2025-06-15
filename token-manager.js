const fs = require('fs').promises;
class TokenManager {
	constructor(admin) {
		this.tokenCache = new Map();
		this.cacheFile = './data/tokens.json';
		this.admin = admin;
	}
	async generateTokens(count = 10, ttlSeconds = 1800) {
		const tokens = [];

		try {
			for (let i = 0; i < count; i++) {
				const customToken = await this.admin.appCheck().createToken(process.env.FIREBASE_APP_ID, {
					ttlMillis: ttlSeconds * 1000
				});
				
				tokens.push({
					token: customToken.token,
					expiresAt: new Date(Date.now() + (ttlSeconds * 1000)).toISOString(),
					createdAt: new Date().toISOString(),
					ttl: ttlSeconds
				});
			}

			console.log(`Generated ${tokens.length} App Check tokens`);
			return tokens;
		} catch (error) {
			console.error('Failed to generate App Check tokens:', error);
			throw error;
		}
	}
	async saveTokensToFile(tokens) {
		try {
			let existingTokens = [];
			try {
				const data = await fs.readFile(this.cacheFile, 'utf8');
				existingTokens = JSON.parse(data);
			} catch {
			}

			const now = new Date();
			const validTokens = existingTokens.filter(token =>
				new Date(token.expiresAt) > now
			);

			const allTokens = [...validTokens, ...tokens];

			await fs.writeFile(this.cacheFile, JSON.stringify(allTokens, null, 2));
			console.log(`Saved ${allTokens.length} tokens to ${this.cacheFile}`);

			return allTokens;
		} catch (error) {
			console.error('Failed to save tokens:', error);
			throw error;
		}
	}
	async pregenerateTokenPool(totalTokens = 100, batchSize = 10) {
		const batches = Math.ceil(totalTokens / batchSize);
		let allTokens = [];

		for (let i = 0; i < batches; i++) {
			const tokensToGenerate = Math.min(batchSize, totalTokens - (i * batchSize));
			console.log(`Generate batch ${i + 1}/${batches} (${tokensToGenerate} tokens)`);
						
			const tokens = await this.generateTokens(tokensToGenerate);
			allTokens = [...allTokens, ...tokens];

			await new Promise(resolve => setTimeout(resolve, 100));
		}

		await this.saveTokensToFile(allTokens);
		return allTokens;
	}
}

exports.TokenManager = TokenManager;

