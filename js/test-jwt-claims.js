/**
 * JWT Claims Testing Utilities
 * Use these functions in the browser console to test JWT claims implementation
 */

import { JWTClaimsHelper } from './jwt-claims-helper.js';

export class JWTClaimsTester {
  constructor(supabase) {
    this.supabase = supabase;
    this.helper = new JWTClaimsHelper(supabase);
  }

  /**
   * Test 1: Check if JWT claims are present
   */
  async testClaimsPresent() {
    console.group('🔍 Test 1: Check JWT Claims Present');
    
    const claims = await this.helper.getOrgClaims();
    
    if (claims && claims.valid) {
      console.log('✅ PASS: JWT claims are present');
      console.log('   org_id:', claims.org_id);
      console.log('   org_role:', claims.org_role);
    } else {
      console.log('❌ FAIL: JWT claims are missing');
    }
    
    console.groupEnd();
    return claims;
  }

  /**
   * Test 2: Check full JWT structure
   */
  async testJWTStructure() {
    console.group('🔍 Test 2: Check JWT Structure');
    
    const metadata = await this.helper.debugJWT();
    
    if (metadata && metadata.org_id && metadata.org_role) {
      console.log('✅ PASS: app_metadata contains org claims');
    } else {
      console.log('❌ FAIL: app_metadata is missing org claims');
      console.log('   Full app_metadata:', metadata);
    }
    
    console.groupEnd();
    return metadata;
  }

  /**
   * Test 3: Ensure claims (with refresh if needed)
   */
  async testEnsureClaims() {
    console.group('🔍 Test 3: Ensure Claims Present');
    
    const result = await this.helper.ensureClaimsPresent();
    
    if (result.success) {
      console.log('✅ PASS: Claims ensured successfully');
      if (result.refreshed) {
        console.log('   ℹ️  Session was refreshed to get claims');
      } else {
        console.log('   ℹ️  Claims were already present');
      }
      console.log('   Claims:', result.claims);
    } else {
      console.log('❌ FAIL: Could not ensure claims');
      console.log('   Error:', result.error);
      if (result.needs_setup) {
        console.log('   ⚠️  User may not be in any organization');
      }
    }
    
    console.groupEnd();
    return result;
  }

  /**
   * Test 4: Verify claims match expected organization
   */
  async testVerifyOrgMatch(expectedOrgId) {
    console.group('🔍 Test 4: Verify Organization Match');
    
    const matches = await this.helper.verifyOrgMatch(expectedOrgId);
    
    if (matches) {
      console.log('✅ PASS: Claims match expected organization');
      console.log('   Expected org_id:', expectedOrgId);
    } else {
      console.log('❌ FAIL: Claims do not match expected organization');
      console.log('   Expected org_id:', expectedOrgId);
      const claims = await this.helper.getOrgClaims();
      console.log('   Actual org_id:', claims?.org_id);
    }
    
    console.groupEnd();
    return matches;
  }

  /**
   * Test 5: Check organization membership in database
   */
  async testDatabaseMembership() {
    console.group('🔍 Test 5: Check Database Membership');
    
    try {
      const { data: { user }, error: userError } = await this.supabase.auth.getUser();
      
      if (userError || !user) {
        console.log('❌ FAIL: Not authenticated');
        console.groupEnd();
        return null;
      }

      console.log('Current user ID:', user.id);

      const { data: members, error } = await this.supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) {
        console.log('❌ FAIL: Error querying organization_members');
        console.log('   Error:', error);
        console.groupEnd();
        return null;
      }

      if (members && members.length > 0) {
        console.log('✅ PASS: Found active membership(s)');
        console.log('   Memberships:', members);
        
        // Check if claims match first membership
        const claims = await this.helper.getOrgClaims();
        if (claims && claims.org_id === members[0].organization_id) {
          console.log('✅ Claims match first membership');
        } else {
          console.log('⚠️  Claims do not match first membership');
          console.log('   JWT org_id:', claims?.org_id);
          console.log('   DB org_id:', members[0].organization_id);
        }
      } else {
        console.log('❌ FAIL: No active memberships found');
      }
      
      console.groupEnd();
      return members;
    } catch (error) {
      console.log('❌ FAIL: Exception occurred');
      console.log('   Error:', error);
      console.groupEnd();
      return null;
    }
  }

  /**
   * Test 6: Test trigger by adding yourself to an org (if admin)
   * WARNING: Only use this if you're testing with a test organization
   */
  async testTriggerByAddingMember(userId, organizationId, role = 'member') {
    console.group('🔍 Test 6: Test Trigger by Adding Member');
    console.log('⚠️  This test will modify the database');
    
    try {
      // Add member
      const { data, error } = await this.supabase
        .from('organization_members')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          role: role,
          status: 'active',
          accepted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.log('❌ FAIL: Error inserting member');
        console.log('   Error:', error);
        console.groupEnd();
        return null;
      }

      console.log('✅ Member inserted successfully');
      console.log('   Member data:', data);

      // Wait a moment for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh session to get new JWT
      console.log('Refreshing session to get updated JWT...');
      await this.supabase.auth.refreshSession();

      // Check if claims were set
      const claims = await this.helper.getOrgClaims();
      
      if (claims && claims.org_id === organizationId) {
        console.log('✅ PASS: Trigger set JWT claims successfully');
        console.log('   Claims:', claims);
      } else {
        console.log('❌ FAIL: Trigger did not set claims');
        console.log('   Expected org_id:', organizationId);
        console.log('   Actual claims:', claims);
      }
      
      console.groupEnd();
      return data;
    } catch (error) {
      console.log('❌ FAIL: Exception occurred');
      console.log('   Error:', error);
      console.groupEnd();
      return null;
    }
  }

  /**
   * Test 5: Edge Function invocation
   */
  async testEdgeFunctionCall() {
    console.group('🔍 Test 5: Edge Function Call');
    
    try {
      console.log('Calling set-org-claims Edge Function...');
      const result = await this.helper.setOrgClaims();
      
      if (result.success) {
        console.log('✅ PASS: Edge Function successfully set claims');
        console.log('   Claims:', result.claims);
        console.log('   Message:', result.message);
      } else {
        console.log('❌ FAIL: Edge Function failed');
        console.log('   Error:', result.error);
      }
      
      console.groupEnd();
      return result;
    } catch (error) {
      console.log('❌ FAIL: Exception occurred');
      console.log('   Error:', error.message);
      console.groupEnd();
      return { success: false, error: error.message };
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Running All JWT Claims Tests (Edge Function Version)\n');
    
    await this.testClaimsPresent();
    console.log('');
    
    await this.testJWTStructure();
    console.log('');
    
    await this.testEnsureClaims();
    console.log('');
    
    await this.testDatabaseMembership();
    console.log('');
    
    await this.testEdgeFunctionCall();
    console.log('');
    
    console.log('✅ All tests completed');
  }
}

// Make available globally for browser console
if (typeof window !== 'undefined') {
  window.JWTClaimsTester = JWTClaimsTester;
}
