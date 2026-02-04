# Multi-Item Subscription - Technical Reference

## API Interaction Diagram

```
User clicks "Buy Additional Licenses"
            ↓
Frontend (paddle.js)
    ├─ GET organization_licenses (check for subscription_id)
    │
    ├─ If subscription_id exists AND not expired:
    │   │
    │   └─ POST /add-subscription-items
    │       ├─ organizationId
    │       ├─ subscriptionId
    │       └─ quantity
    │
    │   Edge Function (add-subscription-items)
    │       ├─ GET /subscriptions/{id} (Paddle API)
    │       ├─ GET current subscription items
    │       ├─ PATCH /subscriptions/{id} (Paddle API)
    │       │  └─ Update with new items + proration_immediately
    │       ├─ UPDATE organization_licenses.total_licenses
    │       └─ Return success + next_billed_at
    │
    │   Paddle Webhook (async)
    │       ├─ subscription.updated event
    │       ├─ webhook → paddle-webhook function
    │       ├─ Recalculate total_licenses from items
    │       └─ UPDATE organization_licenses.total_licenses
    │
    └─ Show success message to user
        "✓ Added 5 licenses! Renewing on [date]"

Else (no subscription or expired):
    └─ Open Paddle checkout (normal flow)
```

---

## Function: `add-subscription-items`

### Request

```typescript
POST /functions/v1/add-subscription-items
Authorization: Bearer {user_access_token}
Content-Type: application/json

{
  "organizationId": "org_12345",
  "subscriptionId": "sub_67890",
  "quantity": 5
}
```

### Response (Success)

```typescript
HTTP 200
{
  "success": true,
  "subscriptionId": "sub_67890",
  "additionalLicenses": 5,
  "totalLicenses": 10,
  "nextBilledAt": "2025-02-03T00:00:00Z",
  "message": "Successfully added 5 additional license(s) to your subscription. All licenses will renew together on Feb 3, 2025."
}
```

### Response (Error)

```typescript
HTTP 400 | 403 | 500
{
  "error": "Error message describing what went wrong",
  "details": {... optional Paddle API response ...}
}
```

---

## Paddle API Calls Made

### Step 1: GET Current Subscription

```bash
GET https://sandbox-api.paddle.com/subscriptions/sub_67890
Authorization: Bearer $PADDLE_API_KEY

Response:
{
  "data": {
    "id": "sub_67890",
    "customer_id": "ctm_12345",
    "next_billed_at": "2025-02-03T00:00:00Z",
    "items": [
      {
        "price_id": "pri_11111",
        "quantity": 1
      }
    ]
  }
}
```

### Step 2: PATCH to Add Item

```bash
PATCH https://sandbox-api.paddle.com/subscriptions/sub_67890
Authorization: Bearer $PADDLE_API_KEY
Content-Type: application/json

{
  "items": [
    {
      "price_id": "pri_11111",
      "quantity": 1
    },
    {
      "price_id": "pri_11111",
      "quantity": 5
    }
  ],
  "proration_billing_mode": "prorated_immediately"
}

Response:
{
  "data": {
    "id": "sub_67890",
    "items": [
      {
        "price_id": "pri_11111",
        "quantity": 1
      },
      {
        "price_id": "pri_11111",
        "quantity": 5
      }
    ],
    "next_billed_at": "2025-02-03T00:00:00Z"
  }
}
```

---

## Database Queries

### 1. Check for existing license

```sql
SELECT
  id,
  organization_id,
  total_licenses,
  subscription_id,
  expires_at
FROM organization_licenses
WHERE organization_id = $1
LIMIT 1
```

### 2. Verify user is admin

```sql
SELECT role, status
FROM organization_members
WHERE user_id = $1
  AND organization_id = $2
  AND status = 'active'
LIMIT 1
```

### 3. Update total licenses

```sql
UPDATE organization_licenses
SET
  total_licenses = $1,
  updated_at = NOW()
WHERE organization_id = $2
RETURNING *
```

### 4. Find license by subscription (for webhook)

```sql
SELECT organization_id, total_licenses
FROM organization_licenses
WHERE subscription_id = $1
LIMIT 1
```

### 5. Recalculate total after subscription.updated

```sql
UPDATE organization_licenses
SET
  total_licenses = $1,
  updated_at = NOW()
WHERE subscription_id = $2
```

---

## Data Flow: Complete Purchase

### Initial State

```
Database:
  organization_licenses
    ├─ id: lic_123
    ├─ organization_id: org_abc
    ├─ total_licenses: 1
    ├─ used_licenses: 1
    ├─ subscription_id: sub_xyz
    └─ expires_at: 2025-02-03

Paddle:
  subscriptions/sub_xyz
    ├─ items: [{ price_id: pri_11111, quantity: 1 }]
    └─ next_billed_at: 2025-02-03
```

### User Action

```
Frontend calls:
POST /add-subscription-items
{
  organizationId: "org_abc",
  subscriptionId: "sub_xyz",
  quantity: 5
}
```

### After Paddle Update

```
Paddle:
  subscriptions/sub_xyz
    ├─ items: [
    │   { price_id: pri_11111, quantity: 1 },
    │   { price_id: pri_11111, quantity: 5 }
    │ ]
    └─ next_billed_at: 2025-02-03 (unchanged)
```

### After Database Update (Edge Function)

```
Database:
  organization_licenses
    ├─ id: lic_123
    ├─ organization_id: org_abc
    ├─ total_licenses: 6        ← UPDATED (1 + 5)
    ├─ used_licenses: 1         ← unchanged
    ├─ subscription_id: sub_xyz
    └─ expires_at: 2025-02-03   ← unchanged
```

### After Webhook Event

```
Paddle sends: subscription.updated
  └─ Includes items array with quantities

Webhook handler:
  ├─ Finds license by subscription_id
  ├─ Calculates: totalLicenses = sum(all quantities) = 1 + 5 = 6
  └─ Updates organization_licenses.total_licenses = 6
```

---

## Error Handling

### Error 1: User Not Authenticated

```javascript
// Frontend detects no session
→ Redirect to login
```

### Error 2: User Not Admin

```javascript
// Edge function checks membership
→ Returns 403 Forbidden
→ Frontend shows: "Only admins can add licenses"
```

### Error 3: Organization Not Found

```javascript
// Edge function can't find subscription
→ Returns 400 Bad Request
→ Frontend shows: "Could not determine license subscription"
```

### Error 4: Paddle API Error

```javascript
// Paddle returns error on subscription update
→ Edge function returns 500 with Paddle error details
→ Frontend shows: "Failed to add licenses. Please contact support."
```

### Error 5: Database Error (Non-Fatal)

```javascript
// Database update fails but Paddle succeeded
→ Edge function logs warning but returns 200
→ Webhook will sync database on next subscription.updated event
→ No user-facing error
```

---

## Security Considerations

### Authorization

1. ✅ User must be authenticated (JWT token checked)
2. ✅ User must be admin of organization (checked against organization_members)
3. ✅ Subscription must belong to organization (validated implicitly via database query)

### Input Validation

1. ✅ All required fields present
2. ✅ Quantity between 1-1000
3. ✅ OrganizationId is valid UUID format
4. ✅ SubscriptionId starts with "sub\_"

### API Keys

1. ✅ PADDLE_API_KEY never sent to frontend
2. ✅ Only stored in Supabase secrets
3. ✅ Webhook signature verified with PADDLE_WEBHOOK_SECRET

### Database

1. ✅ Service role key used (has elevated privileges)
2. ✅ Row-level security (RLS) policies still apply
3. ✅ Queries parameterized (no SQL injection)

---

## Proration Behavior

### Example: Adding 5 Licenses Mid-Month

**Scenario:**

- License purchased: Jan 1, 2025 for $200
- Current date: Jan 15, 2025
- Renewal date: Feb 1, 2025 (31 days total, 17 days remaining)
- Additional licenses: 5

**Calculation (done by Paddle):**

```
Daily rate: $200 / 365 = $0.5479/day
Remaining days: 17
Cost per license: $0.5479 × 17 = $9.31
Total for 5 licenses: $9.31 × 5 = $46.55

Customer charged: $46.55 immediately
Next renewal: Still Feb 1 (ALL items renew together)
```

---

## Webhook Events

### subscription.updated Event

```json
{
  "event_id": "evt_12345",
  "event_type": "subscription.updated",
  "created_at": "2025-01-15T10:30:00Z",
  "data": {
    "id": "sub_xyz",
    "customer_id": "ctm_abc",
    "next_billed_at": "2025-02-01T00:00:00Z",
    "items": [
      {
        "price_id": "pri_11111",
        "quantity": 1
      },
      {
        "price_id": "pri_11111",
        "quantity": 5
      }
    ]
  }
}
```

### What Triggers subscription.updated

- Adding items to subscription
- Removing items from subscription
- Changing quantity of items
- Changing next_billed_at date
- Pausing/resuming subscription

---

## Testing with cURL

### Test add-subscription-items

```bash
# Get session token first
ACCESS_TOKEN=$(supabase_auth_token)

curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/add-subscription-items \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_test",
    "subscriptionId": "sub_test",
    "quantity": 3
  }'
```

### Test webhook signature

```bash
# Paddle will send this header:
# paddle-signature: ts=1705324200;h1=abc123...

# Verify locally:
TIMESTAMP="1705324200"
BODY="..."
SECRET="your_webhook_secret"

# HMAC-SHA256: timestamp + : + body, signed with secret
```

---

## Monitoring SQL Queries

### See all subscriptions by organization

```sql
SELECT
  o.name,
  ol.subscription_id,
  ol.total_licenses,
  ol.used_licenses,
  ol.expires_at,
  ol.updated_at
FROM organizations o
LEFT JOIN organization_licenses ol ON o.id = ol.organization_id
WHERE ol.subscription_id IS NOT NULL
ORDER BY ol.updated_at DESC;
```

### Audit trail (if timestamps tracked)

```sql
SELECT
  organization_id,
  total_licenses,
  updated_at,
  EXTRACT(EPOCH FROM updated_at) as timestamp
FROM organization_licenses
WHERE subscription_id = 'sub_xyz'
ORDER BY updated_at DESC;
```

---

## Performance Metrics

| Operation                 | Time   | Notes                    |
| ------------------------- | ------ | ------------------------ |
| Edge function (total)     | ~500ms | 2 Paddle API calls       |
| Paddle GET subscription   | ~200ms | Cached often             |
| Paddle PATCH subscription | ~200ms | Actual update            |
| Database update           | ~50ms  | Single row update        |
| Webhook delivery          | ~100ms | Async, after transaction |
| User sees result          | ~500ms | One roundtrip            |

**Total user-facing latency: ~500ms** (Much faster than checkout which is 5-10s)

---

## Logging Points

The function logs important events:

1. `Fetching subscription details for {id}`
2. `Current subscription items: [...]`
3. `Updated items to send to Paddle: [...]`
4. `Subscription updated successfully`
5. `Updating database: total_licenses = {count}`

Find these in: Supabase Dashboard → Functions → add-subscription-items → Logs
