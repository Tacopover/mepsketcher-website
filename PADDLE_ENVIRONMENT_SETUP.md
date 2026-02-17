# Paddle Environment Switching Guide

## Overview

The Paddle integration now supports easy switching between sandbox and production environments without modifying code. All configuration is centralized in a single file.

## Files in the New System

```
js/
├── paddle-environment.js          ← Change this ONE line to switch environments
├── paddle-config.production.js    ← Production credentials (live_ tokens)
├── paddle-config.sandbox.js       ← Sandbox credentials (test_ tokens)
└── paddle-config.js               ← Wrapper that loads appropriate config
```

## How to Switch Environments

### Method 1: Direct Change (Simplest)

Edit `js/paddle-environment.js`:

```javascript
// Change this line:
const PADDLE_ENVIRONMENT = "production"; // or 'sandbox'
```

Then reload your browser.

## Workflow Examples

### Testing a Transaction in Sandbox

```bash
# 1. Create a feature branch
git checkout -b feature/paddle-testing

# 2. Edit paddle-environment.js
# Change: const PADDLE_ENVIRONMENT = 'production';
# To: const PADDLE_ENVIRONMENT = 'sandbox';

# 3. Test your changes
# ... test in sandbox ...

# 4. Switch back to production
# Change: const PADDLE_ENVIRONMENT = 'sandbox';
# To: const PADDLE_ENVIRONMENT = 'production';

# 5. Commit and merge back
git add .
git commit -m "Test paddle changes"
git checkout main
git merge feature/paddle-testing
```

### Advanced: Environment Per Branch

If you want different environments automatically per branch:

1. Add to `.gitignore`:

```
js/paddle-environment.js
```

2. Create a setup script `scripts/setup-env.sh`:

```bash
#!/bin/bash
if [[ $(git rev-parse --abbrev-ref HEAD) == "develop" ]]; then
  echo "const PADDLE_ENVIRONMENT = 'sandbox';" > js/paddle-environment.js
else
  echo "const PADDLE_ENVIRONMENT = 'production';" > js/paddle-environment.js
fi
```

3. Run before switching branches:

```bash
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh
```

## Setup Instructions

Before using production, you must:

1. **Get Production Credentials from Paddle Dashboard**
   - Log in to Paddle > Developer tools > Authentication
   - Copy your Production Client Token (starts with `live_`)

2. **Update `js/paddle-config.production.js`**

   ```javascript
   clientToken: 'live_YOUR_ACTUAL_PRODUCTION_TOKEN',

   products: {
       yearly: {
           id: 'pri_YOUR_PRODUCTION_PRICE_ID',  // Get from Paddle dashboard
       }
   }
   ```

3. **Set Default Environment**
   - Keep `js/paddle-environment.js` set to `'production'`

4. **Test Thoroughly**
   - Switch to sandbox to verify using `PADDLE_ENVIRONMENT = 'sandbox'`
   - Process test transactions with test card numbers
   - Switch back to production

## How It Works

1. **paddle-environment.js** sets a global `PADDLE_ENVIRONMENT` variable
2. **paddle-config.js** checks this variable and loads the appropriate config:
   - If `'sandbox'` → loads `PaddleConfigSandbox` from paddle-config.sandbox.js
   - If `'production'` → loads `PaddleConfigProduction` from paddle-config.production.js
3. The rest of your code (`paddle.js`) uses `PaddleConfig` as normal
4. Paddle SDK automatically uses the correct environment

## Checking Current Environment

### In Browser Console

```javascript
console.log("Current environment:", PADDLE_ENVIRONMENT);
console.log("Using token:", PaddleConfig.clientToken.substring(0, 15) + "...");
console.log("Current config:", PaddleConfig);
```

### Debug Function

The `checkPaddleStatus()` function shows full environment info:

```javascript
checkPaddleStatus(); // Run in browser console
```

## Troubleshooting

**Issue**: "ERROR: paddle-environment.js not loaded"

- **Solution**: Make sure `paddle-environment.js` script tag is FIRST, before other paddle scripts

**Issue**: Getting wrong environment

- **Solution**: Check `PADDLE_ENVIRONMENT` value in console: `console.log(PADDLE_ENVIRONMENT)`
- Reload page with hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`

**Issue**: Production token not working

- **Solution**: Verify token starts with `live_` (not `test_`)
- Check you copied the entire token correctly
- Ensure you're using the CLIENT token, not API key

**Issue**: Still seeing 'sandbox' messages

- **Solution**: Clear browser cache or open in private/incognito window
- Verify you edited the correct file path

## Future Enhancements

Consider adding:

- Environment-specific webhook URLs
- Different product IDs per environment
- Logging of environment on app startup
- Admin UI to switch environments without code changes
