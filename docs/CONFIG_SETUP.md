# Supabase Configuration Setup

This project uses a secure configuration system to protect sensitive Supabase credentials from being committed to the repository.

## How It Works

The configuration system uses two files:

1. **`supabase-config.local.js.example`** - Template file with placeholder values (tracked by git)
2. **`supabase-config.local.js`** - Your actual credentials (gitignored, not tracked)
3. **`supabase-config.js`** - Configuration loader (tracked by git)

## Initial Setup

### 1. Copy the Example File

```powershell
# In the js/ directory
Copy-Item supabase-config.local.js.example supabase-config.local.js
```

### 2. Edit Your Local Config

Open `js/supabase-config.local.js` and replace the placeholder values with your actual Supabase credentials:

```javascript
const SUPABASE_CONFIG = {
  url: "https://your-project.supabase.co",
  anonKey: "your-actual-anon-key-here",
};
```

### 3. Get Your Credentials

Find your Supabase credentials at:

- Go to your Supabase project dashboard
- Click on "Project Settings" (gear icon)
- Navigate to "API" section
- Copy the "Project URL" and "anon public" key

**Important Notes:**

- The `anonKey` is safe to use in client-side code - it's designed for browser use
- Do NOT include the `serviceRoleKey` in client-side code
- The service role key should only be used in server-side environments

## File Loading Order

In your HTML files, load the scripts in this order:

```html
<!-- 1. Load Supabase SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- 2. Load your local configuration FIRST -->
<script src="js/supabase-config.local.js"></script>

<!-- 3. Load the config loader -->
<script src="js/supabase-config.js"></script>

<!-- 4. Load other scripts that use Supabase -->
<script src="js/auth.js"></script>
<script src="js/dashboard.js"></script>
```

## Security Best Practices

### ✅ DO:

- Keep `supabase-config.local.js` in `.gitignore`
- Use the `anonKey` for client-side applications
- Commit the `.example` file to help other developers
- Update credentials in `supabase-config.local.js` only

### ❌ DON'T:

- Commit `supabase-config.local.js` to the repository
- Put credentials directly in HTML files
- Use the `serviceRoleKey` in client-side code
- Share your credentials in public forums or documentation

## Troubleshooting

### Configuration Not Loading

If you see errors about missing configuration:

1. Check that `supabase-config.local.js` exists in the `js/` folder
2. Verify the file contains valid JavaScript syntax
3. Ensure scripts are loaded in the correct order in your HTML
4. Check browser console for specific error messages

### Still Using Placeholder Values

If you see `YOUR_SUPABASE_URL_HERE` in error messages:

1. Open `js/supabase-config.local.js`
2. Replace ALL placeholder text with actual credentials
3. Make sure the file exports `SUPABASE_CONFIG` correctly
4. Refresh your browser (clear cache if needed)

## For Team Members

When setting up this project for the first time:

1. Clone the repository
2. Copy `js/supabase-config.local.js.example` to `js/supabase-config.local.js`
3. Ask the project administrator for the Supabase credentials
4. Update your local file with the provided credentials
5. Never commit your `supabase-config.local.js` file

## Syncing with C# Desktop App

The website shares the same Supabase backend as the MepSketcher desktop application. The credentials should match those in:

```
MepSketcher\MEPSketcher2\Configuration\SupabaseConfig.cs
```

The C# application uses environment variables with fallback defaults. For the website, we use the local configuration file approach instead.

## Production Deployment

For GitHub Pages deployment:

1. The `supabase-config.local.js` file will NOT be deployed (it's gitignored)
2. You need to include the actual credentials in a way that works for your hosting
3. Options:
   - **Option A**: Create a build process that injects credentials
   - **Option B**: Use a backend proxy to hide credentials
   - **Option C**: For GitHub Pages, you can commit a production config file (since anonKey is safe to expose)

### GitHub Pages Approach

For GitHub Pages, you can create a separate production config:

1. Create `js/supabase-config.prod.js` with actual credentials
2. Commit this file (anonKey is safe to expose publicly)
3. Update HTML to load `.prod.js` in production
4. Remember: Only the anonKey should be in client-side production code

## Questions?

If you have questions about the configuration setup, contact the project maintainer or refer to the Supabase documentation:

- https://supabase.com/docs/guides/api
- https://supabase.com/docs/guides/auth
