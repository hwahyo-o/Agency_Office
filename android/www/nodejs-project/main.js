process.env.OFFICE_MOBILE = '1';
import('./office/server.mjs').catch(error => console.error('AI Team Office engine failed:', error));
