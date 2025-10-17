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

| Column       | Type                     | Nullable | Default                 | Description                       |
| ------------ | ------------------------ | -------- | ----------------------- | --------------------------------- |
| `id`         | text                     | NO       | gen_random_uuid()::text | Primary key                       |
| `name`       | text                     | NO       | -                       | Organization name                 |
| `owner_id`   | text                     | NO       | -                       | User ID of the organization owner |
| `created_at` | timestamp with time zone | YES      | now()                   | When the organization was created |
| `updated_at` | timestamp with time zone | YES      | now()                   | Last update timestamp             |

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

Stores license information for organizations.

| Column            | Type                     | Nullable | Default           | Description                         |
| ----------------- | ------------------------ | -------- | ----------------- | ----------------------------------- |
| `id`              | uuid                     | NO       | gen_random_uuid() | Primary key                         |
| `organization_id` | text                     | NO       | -                 | Foreign key to organizations.id     |
| `total_licenses`  | integer                  | NO       | 0                 | Total number of licenses purchased  |
| `used_licenses`   | integer                  | NO       | 0                 | Number of licenses currently in use |
| `license_type`    | varchar                  | NO       | 'standard'        | Type of license                     |
| `created_at`      | timestamp with time zone | YES      | now()             | When the license was created        |
| `updated_at`      | timestamp with time zone | YES      | now()             | Last update timestamp               |
| `expires_at`      | timestamp with time zone | YES      | now()             | When the license expires            |
| `paddle_id`       | text                     | YES      | -                 | Paddle transaction/subscription ID  |

---

## Table: `pending_organizations`

Temporary storage for organization purchases made before user signup.

| Column              | Type                     | Nullable | Default           | Description                        |
| ------------------- | ------------------------ | -------- | ----------------- | ---------------------------------- |
| `id`                | uuid                     | NO       | gen_random_uuid() | Primary key                        |
| `user_email`        | text                     | NO       | -                 | Email of the purchaser             |
| `organization_name` | text                     | NO       | -                 | Name of the organization to create |
| `user_name`         | text                     | NO       | -                 | Name of the purchaser              |
| `created_at`        | timestamp with time zone | YES      | now()             | When the pending org was created   |

**Purpose**: When someone purchases licenses without an account, store the data here. When they sign up, move data to proper tables.

---

## Database Flow

### User Signup Flow

1. User signs up → creates entry in `auth.users` (automatic)
2. Create entry in `user_profiles` with user info
3. Check `pending_organizations` for matching email
4. If found, create organization and license records

### Purchase Flow (Authenticated User)

1. User completes Paddle checkout
2. Webhook receives transaction data
3. Create/update `organizations` entry
4. Create/update `organization_licenses` entry
5. Add user to `organization_members`

### Purchase Flow (Guest User)

1. Guest completes Paddle checkout
2. Webhook creates entry in `pending_organizations`
3. When user signs up, pending org is processed and moved to real tables
