/**
 * JWT Claims Helper - Uses Edge Function
 * Ensures JWT contains org_id and org_role claims
 */
export class JWTClaimsHelper {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Get current organization claims from JWT
   * @returns {Promise<Object|null>} Claims or null if not set
   */
  async getOrgClaims() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error || !session) {
        return null;
      }

      const orgId = session.user?.app_metadata?.org_id;
      const orgRole = session.user?.app_metadata?.org_role;

      if (orgId && orgRole) {
        return {
          org_id: orgId,
          org_role: orgRole,
          valid: true
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting org claims:', error);
      return null;
    }
  }

  /**
   * Set organization claims by calling Edge Function
   * @returns {Promise<Object>} Result with success status
   */
  async setOrgClaims() {
    try {
      console.log('Calling Edge Function to set org claims...');

      // Call the Edge Function
      const { data, error } = await this.supabase.functions.invoke('set-org-claims', {
        body: {} // No body needed, uses JWT from headers
      });

      if (error) {
        console.error('Edge Function error:', error);
        return { 
          success: false, 
          error: error.message || 'Failed to set claims'
        };
      }

      console.log('Edge Function response:', data);

      if (!data.success) {
        return { 
          success: false, 
          error: data.error || 'Unknown error from Edge Function'
        };
      }

      // Claims updated in auth.users, now refresh session to get new JWT
      console.log('Claims set in database, refreshing session...');
      const { error: refreshError } = await this.supabase.auth.refreshSession();

      if (refreshError) {
        console.error('Error refreshing session:', refreshError);
        return { 
          success: false, 
          error: 'Claims updated but session refresh failed'
        };
      }

      // Verify claims are now present
      const claims = await this.getOrgClaims();
      
      if (!claims || !claims.valid) {
        return {
          success: false,
          error: 'Claims not found in JWT after refresh'
        };
      }

      return {
        success: true,
        claims,
        message: data.message
      };

    } catch (error) {
      console.error('Error setting claims:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Ensure JWT claims are present - calls Edge Function if needed
   * Call this once on app initialization or after signup/login
   * @returns {Promise<Object>} Result with claims or error
   */
  async ensureClaimsPresent() {
    try {
      // Check if claims already exist
      let claims = await this.getOrgClaims();
      
      if (claims && claims.valid) {
        console.log('JWT claims already present:', claims);
        return { success: true, claims, already_set: true };
      }

      // Claims missing - call Edge Function to set them
      console.log('JWT claims missing, calling Edge Function to set them...');
      const result = await this.setOrgClaims();

      if (!result.success) {
        console.warn('Failed to set claims via Edge Function:', result.error);
        return result; // Return error from setOrgClaims
      }

      console.log('JWT claims successfully set:', result.claims);
      return { 
        success: true, 
        claims: result.claims, 
        newly_set: true 
      };

    } catch (error) {
      console.error('Error ensuring claims:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify claims match expected organization
   * Useful for debugging or validation
   * @param {string} expectedOrgId - Expected organization ID
   * @returns {Promise<boolean>}
   */
  async verifyOrgMatch(expectedOrgId) {
    const claims = await this.getOrgClaims();
    
    if (!claims || !claims.valid) {
      console.warn('No valid claims to verify');
      return false;
    }

    const matches = claims.org_id === expectedOrgId;
    
    if (!matches) {
      console.error('Org ID mismatch!', {
        expected: expectedOrgId,
        actual: claims.org_id
      });
    }

    return matches;
  }

  /**
   * Debug helper - logs current JWT structure
   */
  async debugJWT() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (!session) {
        console.log('No active session');
        return;
      }

      console.group('JWT Debug Info');
      console.log('User ID:', session.user.id);
      console.log('Email:', session.user.email);
      console.log('app_metadata:', session.user.app_metadata);
      console.log('Full user object:', session.user);
      console.groupEnd();
      
      return session.user.app_metadata;
    } catch (error) {
      console.error('Error debugging JWT:', error);
    }
  }

  /**
   * Call Edge Function directly to set claims (for testing)
   * @returns {Promise<Object>} Edge Function response
   */
  async callEdgeFunctionDirectly() {
    return await this.setOrgClaims();
  }
}
