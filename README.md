# MepSketcher Website

Official website for MepSketcher - A professional MEP design tool for PDF drawings.

## About MepSketcher

MepSketcher is a specialized CAD-like application for designing MEP (Mechanical, Electrical, and Plumbing) systems on PDF drawings.

**Source Code Repository**: [MepSketcher](https://github.com/Tacopover/MepSketcher)

## Local Development

1. Clone this repository
2. Open `index.html` in your browser
3. No build process required - it's a static site!

## Deployment

This site is deployed using GitHub Pages.

### To Deploy:

1. Push changes to the `main` branch
2. Go to repository Settings → Pages
3. Set Source to "Deploy from a branch"
4. Select `main` branch and `/ (root)` folder
5. Save

Your site will be available at: `https://tacopover.github.io/mepsketcher-website/`

### Custom Domain Setup:

1. Add a `CNAME` file with `mepsketcher.com`
2. Configure DNS settings at your domain registrar:
   - A records pointing to GitHub Pages IPs
   - CNAME record for www subdomain

## Project Structure

```
mepsketcher-website/
├── index.html              # Main landing page
├── login.html              # Login page
├── dashboard.html          # User dashboard
├── purchase-success.html   # Post-purchase page
├── css/                    # Stylesheets
│   ├── style.css          # Main styles
│   └── auth.css           # Authentication styles
├── js/                     # JavaScript modules
│   ├── auth.js            # Authentication service
│   ├── dashboard.js       # Dashboard logic
│   ├── paddle.js          # Paddle payment integration
│   └── supabase-config.js # Supabase configuration
├── supabase/               # Supabase Edge Functions
│   └── functions/
│       ├── signup/        # User signup handler
│       ├── signin/        # User signin handler (with trial logic)
│       └── paddle-webhook/ # Paddle payment webhook
├── docs/                   # Documentation
│   ├── QUICK_START_GUIDE.md        # Quick start for developers
│   ├── SUPABASE_SCHEMA.md          # Database schema reference
│   ├── DATABASE_MIGRATIONS.sql     # Database setup SQL
│   ├── implementation-plans/       # Detailed implementation docs
│   │   ├── PAYMENT_FLOW_TODO.md   # Main checklist
│   │   ├── PAYMENT_FLOW_IMPLEMENTATION_PLAN.md
│   │   ├── PAYMENT_FLOW_VISUAL.md
│   │   └── ... (other plans)
│   └── ... (other docs)
└── README.md               # This file
```

## Documentation

### Getting Started

- **[Quick Start Guide](docs/QUICK_START_GUIDE.md)** - Start here for development
- **[Payment Flow TODO](docs/implementation-plans/PAYMENT_FLOW_TODO.md)** - Implementation checklist

### Technical Reference

- **[Database Schema](docs/SUPABASE_SCHEMA.md)** - Table structures and relationships
- **[Database Migrations](docs/DATABASE_MIGRATIONS.sql)** - SQL migrations for setup
- **[Authentication Setup](docs/AUTHENTICATION_README.md)** - Auth configuration guide
- **[Testing Guide](docs/TESTING_GUIDE.md)** - How to test the application

### Implementation Plans

See `docs/implementation-plans/` for detailed specifications and flow diagrams.

## Features

- 🔐 **User Authentication** - Supabase Auth with email confirmation
- 🆓 **14-Day Free Trial** - All features with PDF watermark
- 💳 **Paddle Payment Integration** - Secure subscription handling
- 👥 **Organization Management** - Multi-user support with role-based access
- 📊 **License Management** - Automatic provisioning and tracking

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Payments**: Paddle (Subscription billing)
- **Deployment**: GitHub Pages (static site) + Supabase Cloud (backend)

## License

Copyright © 2025 MepSketcher. All rights reserved.
