// Supabase Configuration Loader
// This file loads configuration from supabase-config.local.js
// If local config doesn't exist, it uses placeholder values

// Default configuration (placeholder values)
const DEFAULT_CONFIG = {
    url: 'YOUR_SUPABASE_URL_HERE',
    anonKey: 'YOUR_SUPABASE_ANON_KEY_HERE'
};

// This will be replaced by the actual config from supabase-config.local.js
// Make sure to create supabase-config.local.js based on supabase-config.local.js.example
let SUPABASE_CONFIG = DEFAULT_CONFIG;

// Note: The actual configuration is loaded from supabase-config.local.js
// which should be loaded BEFORE this file in your HTML
// Example: 
// <script src="js/supabase-config.local.js"></script>
// <script src="js/supabase-config.js"></script>

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
