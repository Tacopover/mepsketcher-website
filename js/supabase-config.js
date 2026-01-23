// Supabase Configuration Loader
// This file loads configuration from supabase-config.local.js
// If local config doesn't exist, it uses placeholder values

// Default configuration (placeholder values)
const DEFAULT_CONFIG = {
    url: 'YOUR_SUPABASE_URL_HERE',
    anonKey: 'YOUR_SUPABASE_ANON_KEY_HERE'
};

// SUPABASE_CONFIG should already be declared in supabase-config.local.js
// This file only provides the fallback and helper functions
// If supabase-config.local.js is missing, we need to use window to avoid redeclaration
if (typeof SUPABASE_CONFIG === 'undefined') {
    window.SUPABASE_CONFIG = DEFAULT_CONFIG;
}

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
