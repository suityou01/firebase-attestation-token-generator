const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs').promises;
const morgan = require('morgan');
const helmet = require('helmet');
const TokenManager = require('./token-manager.js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const project_id = process.env.PROJECT_ID || 'govuk-app';
const app_id = process.env.FIREBASE_APP_ID;
const serviceAccount = require('./firebase-config/govuk-app-firebase-adminsdk-asx8b-baab689577.json');
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	//projectId: serviceAccount.project_id
});

const tokenManager = new TokenManager.TokenManager(admin);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (important for Fargate)
app.get('/health', (req, res) => {
	res.status(200).json({
    		status: 'healthy',
    		timestamp: new Date().toISOString(),
    		uptime: process.uptime()
  	});
});

// Root endpoint
app.get('/', (req, res) => {
	res.json({
		message: 'Express app running on AWS Fargate!',
    		environment: process.env.NODE_ENV || 'development',
    		version: process.env.npm_package_version || '1.0.0'
  	});
});

app.get('/debug-app-check', async (req, res) => {
	console.log('=== Firebase App Check Debug Session ===\n');
	
	console.log('1. CONFIGURATION CHECK');
	console.log('Project ID:', serviceAccount.project_id);
	console.log('Service Account Email:', serviceAccount.client_email);
	console.log('Environment App ID:', process.env.FIREBASE_APP_ID);
	console.log('');
	
	console.log('2. FIREBASE CONNECTION TEST');
	try {
		const app = admin.app();
		console.log('✅ Firebase Admin SDK initialised successfully');
		console.log('App name:', app.name);
		console.log('Project ID from app:', app.options.projectId);
	} catch (error) {
		console.error('❌Firebase initialisation failed:', error.message);
		return;
	}
	console.log('');

	// 3. Project Apps Discovery
	console.log('3. PROJECT APPS DISCOVERY');
  	try {
    		// This might not work with all service account permissions
    		const projectManagement = admin.projectManagement();
    		const apps = await projectManagement.listAndroidApps();
    		console.log('Android apps found:', apps.length);
    
    		const iosApps = await projectManagement.listIosApps();
    		console.log('iOS apps found:', iosApps.length);
    
    		// Note: Web apps require different API calls
  	} catch (error) {
    		console.log('Could not list apps (may need additional permissions):', error.code);
  	}
	console.log('');

	// 4. Test different App ID formats
  	console.log('4. APP ID FORMAT TESTING');
  	const testAppIds = [
    		process.env.FIREBASE_APP_ID,
    		// Try with project prefix if not already present
    		`projects/${serviceAccount.project_id}/apps/${process.env.FIREBASE_APP_ID}`,
    		// Try different variations
    		process.env.FIREBASE_APP_ID?.replace(/^projects\/[^\/]+\/apps\//, ''),
  	].filter(Boolean);

  	for (const appId of testAppIds) {
    		console.log(`\nTesting App ID: "${appId}"`);
    		try {
      			const token = await admin.appCheck().createToken(appId, {
        			ttlMillis: 3600000 // 30 minute for testing
      			});
      			console.log('✓ SUCCESS! Token created successfully');
      			console.log('Token preview:', token.token.substring(0, 30) + '...');
      			console.log('Token TTL:', token.ttlMillis / 1000, 'seconds');
      			break; // Stop on first success
    		} catch (error) {
      			console.error('✗ FAILED:', error.code, '-', error.message);
      
      			// Detailed error analysis
      			if (error.code === 'app-check/invalid-app-resource-name') {
        			console.error(' → This app ID format is invalid or app not found');
      			} else if (error.code === 'app-check/app-not-registered') {
        			console.error(' → App exists but not registered for App Check');
      			} else if (error.code === 'permission-denied') {
        			console.error(' → Service account lacks required permissions');
      			}
    		}
  	}
	console.log('');

	console.log('5. APP CHECK CONFIGURATION TEST');
  	if (process.env.FIREBASE_APP_ID) {
    		try {
      			// Try to get App Check config (this might require different permissions)
      			console.log('Attempting to retrieve App Check configuration...');
      			// Note: This API might not be available through Admin SDK
      			console.log('App Check config retrieval not available through Admin SDK');
    		} catch (error) {
      			console.error('Could not retrieve App Check config:', error.message);
    		}
  	}
  	console.log('');

  	// 6. Recommendations
  	console.log('6. TROUBLESHOOTING RECOMMENDATIONS');
  	console.log('');
  	console.log('If all tests failed, try these steps:');
  	console.log('');
  	console.log('A. Verify App ID format:');
  	console.log(' - Web app: 1:123456789:web:abcdef123456');
  	console.log(' - Android: 1:123456789:android:abcdef123456');
  	console.log(' - iOS: 1:123456789:ios:abcdef123456');
  	console.log('');
  	console.log('B. Check Firebase Console:');
  	console.log(' 1. Go to Project Settings → General');
  	console.log(' 2. Scroll to "Your apps" section');
  	console.log(' 3. Copy the exact App ID');
  	console.log('');
  	console.log('C. Verify App Check registration:');
  	console.log(' 1. Go to Project Settings → App Check');
  	console.log(' 2. Select your app from dropdown');
  	console.log(' 3. Ensure it shows "Registered" status');
  	console.log(' 4. Configure at least one provider (reCAPTCHA v3, etc.)');
  	console.log('');
  	console.log('D. Check service account permissions:');
  	console.log(' Required roles:');
  	console.log(' - Firebase App Check Token Creator');
  	console.log(' - Firebase Admin SDK Service Agent');
  	console.log('');
  	console.log('E. Enable required APIs:');
  	console.log(' - Firebase App Check API');
  	console.log(' - Firebase Management API');
});

app.post('/refresh-tokens', async (req, res) => {
	try {
		const { count = 10, ttl = 1800 } = req.body;
		const tokens = await tokenManager.generateTokens(count, ttl);
		await tokenManager.saveTokensToFile(tokens);

		res.json(tokens);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

app.post('/pregenerate-pool', async (req, res) => {
	try {
		const { totalTokens = 100, batchSize = 10 } = req.body;
		const tokens = await tokenManager.pregenerateTokenPool(totalTokens, batchSize);

		res.json(tokens);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

app.get('/tokens', async (req, res) => {
	try {
		const data = await fs.readFile(tokenManager.cacheFile, 'utf8');
		const tokens = JSON.parse(data);

		const now = new Date();
		const validTokens = tokens.filter(token =>
			new Date(token.expiresAt) > now
		);

		res.json({
			total: tokens.length,
			valid: validTokens.length,
			expired: tokens.length - validTokens.length,
			tokens: validTokens
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
	res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('SIGTERM received, shutting down gracefully');
	server.close(() => {
		console.log('Process terminated');
	});
});

const server = app.listen(PORT, '0.0.0.0', () => {
	console.log(`Token Generator Service is running on port ${PORT}`);
	console.log(`Firebase Project-ID: ${project_id}`);
	console.log(`Firebase APP-ID: ${app_id}`);
	console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
	console.log('Available endpoints:');
	console.log('	POST /refresh-tokens - Generate new tokens');
	console.log('	POST /pregenerate-pool - Generate large token pool');
	console.log('	GET /tokens - Check token status');
});

module.exports = app;
