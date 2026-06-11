// Supabase Configuration
// Production configuration for mepsketcher.com

const SUPABASE_CONFIG = {
    url: 'https://jskwfvwbhyltmxcdsbnm.supabase.co',
    anonKey: 'sb_publishable_uWE7KYNPm7SejCn82I_LjQ_lqt1w04U'
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SUPABASE_CONFIG;
}
