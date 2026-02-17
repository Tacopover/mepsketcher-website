/**
 * Paddle Environment Selector
 * 
 * USAGE:
 * Change the value below to switch between environments:
 * - 'sandbox' : Use sandbox/test environment for testing transactions
 * - 'production' : Use production environment for live transactions
 * 
 * For git workflow:
 * 1. Create a feature branch: git checkout -b feature/sandbox-testing
 * 2. Change this value to 'sandbox'
 * 3. Test your changes
 * 4. Change back to 'production'
 * 5. Commit and merge back to main
 * 
 * ALTERNATIVE: Add this file to .gitignore to have different values across branches
 */

const PADDLE_ENVIRONMENT = 'sandbox'; // Change to 'sandbox' for testing
