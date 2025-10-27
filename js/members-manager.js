// Member Management Module
// Handles inviting, adding, removing, and managing organization members

import { JWTClaimsHelper } from './jwt-claims-helper.js';

export class MembersManager {
  constructor(supabase, organizationId) {
    this.supabase = supabase;
    this.organizationId = organizationId;
    this.jwtHelper = new JWTClaimsHelper(supabase);
    this._claimsEnsured = false;
  }

  /**
   * Deprecated: JWT claims are no longer used since RLS policies were updated
   * @private
   */
  async _ensureClaimsOnce() {
    // No-op: JWT claims are no longer required
    // RLS policies now use direct database queries instead
    return;
  }

  /**
   * Check available licenses for the organization
   * @returns {Promise<Object>} License availability info
   */
  async checkAvailableLicenses() {
    await this._ensureClaimsOnce();
    
    // Fallback: manually check licenses if RPC fails
    return await this.checkAvailableLicensesFallback();
  }

  /**
   * Fallback method to check licenses without using RPC function
   * @private
   */
  async checkAvailableLicensesFallback() {
    try {
      // Get organization info
      const { data: org, error: orgError } = await this.supabase
        .from('organizations')
        .select('is_trial')
        .eq('id', this.organizationId)
        .single();

      if (orgError) {
        console.error('Error fetching organization:', orgError);
        return {
          success: false,
          error: 'Failed to check organization status'
        };
      }

      // If trial, can't add members
      if (org.is_trial) {
        return {
          success: true,
          is_trial: true,
          can_add_member: false,
          total_licenses: 0,
          used_licenses: 0,
          available_licenses: 0,
          message: 'Please upgrade to a paid plan to invite team members'
        };
      }

      // Get license info
      const { data: license, error: licenseError } = await this.supabase
        .from('organization_licenses')
        .select('*')
        .eq('organization_id', this.organizationId)
        .maybeSingle();

      if (licenseError) {
        console.error('Error fetching license:', licenseError);
        return {
          success: false,
          error: 'Failed to check license status'
        };
      }

      if (!license) {
        return {
          success: true,
          is_trial: false,
          can_add_member: false,
          total_licenses: 0,
          used_licenses: 0,
          available_licenses: 0,
          message: 'No license found for this organization'
        };
      }

      // Check if expired
      if (new Date(license.expires_at) < new Date()) {
        return {
          success: true,
          is_expired: true,
          can_add_member: false,
          total_licenses: license.total_licenses,
          used_licenses: license.used_licenses,
          available_licenses: 0,
          message: 'License has expired. Please renew.'
        };
      }

      // Calculate available licenses
      const available = license.total_licenses - license.used_licenses;
      return {
        success: true,
        can_add_member: available > 0,
        total_licenses: license.total_licenses,
        used_licenses: license.used_licenses,
        available_licenses: available,
        expires_at: license.expires_at
      };
    } catch (error) {
      console.error('Error in fallback license check:', error);
      return {
        success: false,
        error: 'Failed to check license availability'
      };
    }
  }

  /**
   * Invite or add a member to the organization
   * - If user exists → Add as active member immediately
   * - If user doesn't exist → Create pending invitation
   * 
   * @param {string} email - Email address of the user to invite
   * @param {string} role - Role to assign (admin or member)
   * @returns {Promise<Object>} Result with success status and action taken
   */
  async inviteMember(email, role = 'member') {
    await this._ensureClaimsOnce();
    
    // 1. Check available licenses
    const licenses = await this.checkAvailableLicenses();
    
    if (!licenses.success) {
      throw new Error(licenses.error || 'Failed to check licenses');
    }

    if (!licenses.can_add_member) {
      throw new Error(licenses.message || 'Cannot add member at this time');
    }

    // 2. Check if user already exists in user_profiles (simple query)
    const { data: existingProfile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is fine
      console.error('Error checking user profile:', profileError);
      throw profileError;
    }

    if (existingProfile) {
      // User exists - add directly as active member
      return await this.addExistingUserToOrg(existingProfile.id, email, role);
    } else {
      // User doesn't exist - create pending invitation
      return await this.createPendingInvitation(email, role);
    }
  }

  /**
   * Add an existing user to the organization as an active member
   * @private
   */
  async addExistingUserToOrg(userId, email, role) {
    // Check if already a member (in any status)
    const { data: existingMember, error: checkError } = await this.supabase
      .from('organization_members')
      .select('id, status')
      .eq('user_id', userId)
      .eq('organization_id', this.organizationId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing membership:', checkError);
      throw checkError;
    }

    if (existingMember) {
      if (existingMember.status === 'active') {
        throw new Error('User is already an active member of this organization');
      }
      
      // Reactivate inactive member
      const { error: updateError } = await this.supabase
        .from('organization_members')
        .update({ 
          status: 'active',
          role: role,
          accepted_at: new Date().toISOString(),
          removed_at: null
        })
        .eq('id', existingMember.id);

      if (updateError) {
        console.error('Error reactivating member:', updateError);
        throw updateError;
      }

      // Increment used_licenses
      await this.incrementUsedLicenses();

      return { 
        success: true, 
        action: 'reactivated', 
        email,
        message: `${email} has been reactivated. They should refresh their page to update access.`
      };
    }

    // Add new active member
    const { error: insertError } = await this.supabase
      .from('organization_members')
      .insert({
        user_id: userId,
        organization_id: this.organizationId,
        role: role,
        status: 'active',
        accepted_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error adding member:', insertError);
      throw insertError;
    }

    // Increment used_licenses
    await this.incrementUsedLicenses();

    return { 
      success: true, 
      action: 'added', 
      email,
      message: `${email} has been added to the organization. They should refresh their page to update access.`
    };
  }

  /**
   * Create a pending invitation for a user who doesn't exist yet
   * @private
   */
  async createPendingInvitation(email, role) {
    // Check if invitation already exists
    const { data: existingInvite, error: checkError } = await this.supabase
      .from('organization_members')
      .select('id, status')
      .eq('email', email)
      .eq('organization_id', this.organizationId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing invitation:', checkError);
      throw checkError;
    }

    if (existingInvite) {
      if (existingInvite.status === 'pending') {
        throw new Error('An invitation has already been sent to this email');
      } else if (existingInvite.status === 'active') {
        throw new Error('This email is already associated with an active member');
      }
    }

    // Create pending member record (without user_id)
    const { data: invite, error: insertError } = await this.supabase
      .from('organization_members')
      .insert({
        organization_id: this.organizationId,
        email: email,
        role: role,
        status: 'pending',
        invited_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating invitation:', insertError);
      throw insertError;
    }

    // TODO: Send invitation email via Supabase Edge Function
    // await this.sendInvitationEmail(email, invite.id);

    // Don't increment used_licenses yet - only when they accept

    return { 
      success: true, 
      action: 'invited', 
      email,
      inviteId: invite.id,
      message: `An invitation has been sent to ${email}`
    };
  }

  /**
   * Accept a pending invitation (called after signup)
   * @param {string} userId - The user ID of the newly signed up user
   * @param {string} email - The email address used for signup
   */
  async acceptInvitation(userId, email) {
    // Find pending invitation by email
    const { data: invite, error: findError } = await this.supabase
      .from('organization_members')
      .select('*')
      .eq('email', email)
      .eq('organization_id', this.organizationId)
      .eq('status', 'pending')
      .maybeSingle();

    if (findError) {
      console.error('Error finding invitation:', findError);
      throw findError;
    }

    if (!invite) {
      throw new Error('No pending invitation found for this email');
    }

    // Update invitation to active member
    const { error: updateError } = await this.supabase
      .from('organization_members')
      .update({
        user_id: userId,
        status: 'active',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invite.id);

    if (updateError) {
      console.error('Error accepting invitation:', updateError);
      throw updateError;
    }

    // NOW increment used_licenses (user activated their license)
    await this.incrementUsedLicenses();

    // Refresh session to get new JWT with claims
    await this.supabase.auth.refreshSession();

    return { success: true };
  }

  /**
   * Remove a member from the organization (set to inactive)
   * @param {string} userId - User ID to remove
   */
  async removeMember(userId) {
    const { error } = await this.supabase
      .from('organization_members')
      .update({ 
        status: 'inactive',
        removed_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('organization_id', this.organizationId)
      .eq('status', 'active'); // Only remove active members

    if (error) {
      console.error('Error removing member:', error);
      throw error;
    }

    // Decrement used_licenses
    await this.decrementUsedLicenses();

    return { success: true };
  }

  /**
   * Get all members of the organization (simple query, no joins)
   * @param {boolean} includeInactive - Whether to include inactive members
   * @returns {Promise<Array>} List of members
   */
  async getMembers(includeInactive = false) {
    let query = this.supabase
      .from('organization_members')
      .select('user_id, email, role, created_at')
      .eq('organization_id', this.organizationId);

    if (!includeInactive) {
      // Only get active members if status column exists
      // If status doesn't exist, this will just get all members
      query = query.or('status.eq.active,status.is.null');
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching members:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Increment used licenses count
   * @private
   */
  async incrementUsedLicenses() {
    // Get current license count
    const { data: license, error: fetchError } = await this.supabase
      .from('organization_licenses')
      .select('used_licenses')
      .eq('organization_id', this.organizationId)
      .single();

    if (fetchError) {
      console.error('Error fetching license for increment:', fetchError);
      throw fetchError;
    }

    // Increment by 1
    const { error } = await this.supabase
      .from('organization_licenses')
      .update({ 
        used_licenses: license.used_licenses + 1
      })
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error incrementing licenses:', error);
      throw error;
    }
  }

  /**
   * Decrement used licenses count (never go below 1 for owner)
   * @private
   */
  async decrementUsedLicenses() {
    // Get current license count
    const { data: license, error: fetchError } = await this.supabase
      .from('organization_licenses')
      .select('used_licenses')
      .eq('organization_id', this.organizationId)
      .single();

    if (fetchError) {
      console.error('Error fetching license for decrement:', fetchError);
      throw fetchError;
    }

    // Decrement by 1, but never go below 1
    const newCount = Math.max(license.used_licenses - 1, 1);
    
    const { error } = await this.supabase
      .from('organization_licenses')
      .update({ 
        used_licenses: newCount
      })
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error decrementing licenses:', error);
      throw error;
    }
  }
}
