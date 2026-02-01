// Supabase Configuration
// Production configuration for mepsketcher.com

const SUPABASE_CONFIG = {
    url: 'https://jskwfvwbhyltmxcdsbnm.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impza3dmdndiaHlsdG14Y2RzYm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5ODA5MzIsImV4cCI6MjA2NzU1NjkzMn0.SE3xzj-1Qi2flWDtlGyyO2Gpp-fRFtoeA0W-ZYCVkvc'
};

// Check if configuration is properly set
function isConfigured() {
    return SUPABASE_CONFIG.url !== DEFAULT_CONFIG.url && 
           !SUPABASE_CONFIG.url.startsWith('YOUR_') &&
           SUPABASE_CONFIG.anonKey !== DEFAULT_CONFIG.anonKey &&
           !SUPABASE_CONFIG.anonKey.startsWith('YOUR_');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SUPABASE_CONFIG;
}
