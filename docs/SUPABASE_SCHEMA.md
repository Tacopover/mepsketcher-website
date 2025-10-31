# Supabase Database Schema

This document describes the database schema for the MepSketcher application.

## Tables Overview

1. **user_profiles** - Stores user profile information
2. **organizations** - Organization/company information
3. **organization_members** - Links users to organizations
4. **organization_licenses** - License information for organizations
5. **pending_organizations** - Temporary storage for organization purchases before user signup

---

## Table: `user_profiles`

Stores profile information for registered users.

| Column       | Type                     | Nullable | Default | Description                         |
| ------------ | ------------------------ | -------- | ------- | ----------------------------------- |
| `id`         | text                     | NO       | -       | Primary key (matches auth.users.id) |
| `email`      | text                     | NO       | -       | User's email address                |
| `name`       | text                     | NO       | -       | User's full name                    |
| `created_at` | timestamp with time zone | YES      | now()   | When the profile was created        |
| `updated_at` | timestamp with time zone | YES      | now()   | Last update timestamp               |

---

## Table: `organizations`

Stores organization/company information.

| Column             | Type                     | Nullable | Default                    | Description                           |
| ------------------ | ------------------------ | -------- | -------------------------- | ------------------------------------- |
| `id`               | text                     | NO       | gen_random_uuid()::text    | Primary key                           |
| `name`             | text                     | NO       | -                          | Organization name                     |
| `owner_id`         | text                     | NO       | -                          | User ID of the organization owner     |
| `is_trial`         | boolean                  | NO       | true                       | Whether organization is in trial mode |
| `trial_expires_at` | timestamp with time zone | YES      | now() + INTERVAL '14 days' | When trial period expires             |
| `created_at`       | timestamp with time zone | YES      | now()                      | When the organization was created     |
| `updated_at`       | timestamp with time zone | YES      | now()                      | Last update timestamp                 |

---

## Table: `organization_members`

Links users to organizations with roles.

| Column            | Type                     | Nullable | Default  | Description                     |
| ----------------- | ------------------------ | -------- | -------- | ------------------------------- |
| `organization_id` | text                     | NO       | -        | Foreign key to organizations.id |
| `user_id`         | text                     | NO       | -        | Foreign key to user_profiles.id |
| `role`            | text                     | NO       | 'member' | User's role in the organization |
| `created_at`      | timestamp with time zone | YES      | now()    | When the membership was created |

**Primary Key**: (organization_id, user_id)

---

## Table: `organization_licenses`

Stores license information for organizations. **Note**: This table is only populated after a successful payment. Trial organizations do not have entries in this table.

| Column             | Type                     | Nullable | Default           | Description                                                 |
| ------------------ | ------------------------ | -------- | ----------------- | ----------------------------------------------------------- |
| `id`               | uuid                     | NO       | gen_random_uuid() | Primary key                                                 |
| `organization_id`  | text                     | NO       | -                 | Foreign key to organizations.id                             |
| `total_licenses`   | integer                  | NO       | 0                 | Total number of licenses purchased                          |
| `used_licenses`    | integer                  | NO       | 1                 | Number of licenses currently in use (starts at 1 for owner) |
| `license_type`     | varchar                  | NO       | 'standard'        | Type of license (currently only 'standard')                 |
| `created_at`       | timestamp with time zone | YES      | now()             | When the license was created                                |
| `updated_at`       | timestamp with time zone | YES      | now()             | Last update timestamp                                       |
| `expires_at`       | timestamp with time zone | YES      | now()             | When the license expires                                    |
| `paddle_id`        | text                     | YES      | -                 | Paddle transaction/subscription ID                          |
| `trial_expires_at` | timestamp with time zone | YES      | -                 | Original trial expiry (for historical tracking)             |

---

## Table: `pending_organizations`

Temporary storage for organization purchases made before user signup, or for new signups before first login.

| Column              | Type                     | Nullable | Default           | Description                        |
| ------------------- | ------------------------ | -------- | ----------------- | ---------------------------------- |
| `id`                | uuid                     | NO       | gen_random_uuid() | Primary key                        |
| `user_id`           | text                     | YES      | -                 | User ID (populated after signup)   |
| `user_email`        | text                     | NO       | -                 | Email of the purchaser             |
| `organization_name` | text                     | NO       | -                 | Name of the organization to create |
| `user_name`         | text                     | NO       | -                 | Name of the purchaser              |
| `created_at`        | timestamp with time zone | YES      | now()             | When the pending org was created   |

**Purpose**: When someone purchases licenses without an account, store the data here. Also used for new signups - entry is created during signup and processed on first login. When they login for the first time, move data to proper tables.

---

## Database Flow

### User Signup Flow (Trial Mode)

1. User signs up → creates entry in `auth.users` (automatic)
2. Edge function creates entry in `user_profiles` with user info
3. Edge function creates entry in `pending_organizations` with user_id and org details
4. User confirms email (click link)
5. User logs in for first time → edge function processes pending org:
   - Create `organizations` entry with `is_trial: true` and `trial_expires_at` set to 14 days from now
   - Add user to `organization_members` as admin
   - Delete `pending_organizations` entry
6. User can now access dashboard in **TRIAL MODE** (all features, PDF watermark)

### Purchase Flow (Authenticated User - Converting from Trial)

1. User clicks "Upgrade to Paid" in dashboard
2. User completes Paddle checkout (passes user_id and organization_id in custom_data)
3. Paddle webhook receives transaction data
4. Edge function creates entry in `organization_licenses`:
   - Sets `total_licenses` based on purchase quantity
   - Sets `used_licenses` to 1 (owner already in organization_members)
   - Sets `license_type` to 'standard'
   - Sets `expires_at` to 1 year from now
   - Stores Paddle subscription/transaction ID
5. Edge function updates `organizations.is_trial` to false
6. User dashboard now shows paid status (no trial banner, no PDF watermark)

### Purchase Flow (Guest User - Future Phase)

1. Guest completes Paddle checkout
2. Webhook creates entry in `pending_organizations` (without user_id)
3. When user signs up with matching email, pending org is processed and moved to real tables
4. License is created immediately (not trial mode)

---

## Key Differences from Original Flow

- **Trial Mode Added**: Organizations start in trial mode (14 days, all features, PDF watermark)
- **License Table Population**: `organization_licenses` is ONLY created after payment, not during first login
- **Free Access**: Users can use the app immediately after signup without payment
- **Trial Tracking**: New columns `is_trial` and `trial_expires_at` in organizations table
- **Owner Counts as Used License**: When license is created after payment, `used_licenses` starts at 1
