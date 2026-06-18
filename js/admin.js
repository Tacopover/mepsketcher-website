// MepSketcher Admin Panel — Overview Dashboard

const STATE = {
    users: [],
    orgs: [],
    view: 'users',       // 'users' | 'orgs'
    search: '',
    expandedOrgs: new Set()
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function relTime(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0) return 'future';
    const mins = Math.floor(diff / 60000);
    if (mins <  1)  return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30)  return `${days}d ago`;
    const mos = Math.floor(days / 30);
    if (mos  < 12)  return `${mos}mo ago`;
    return `${Math.floor(mos / 12)}y ago`;
}

function shortDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchAll() {
    renderLoading();
    try {
        const [uRes, oRes] = await Promise.all([
            fetch('/api/overview/users'),
            fetch('/api/overview/orgs')
        ]);
        if (!uRes.ok) throw new Error(`Users fetch failed (${uRes.status})`);
        if (!oRes.ok) throw new Error(`Orgs fetch failed (${oRes.status})`);
        STATE.users = await uRes.json();
        STATE.orgs  = await oRes.json();
    } catch (err) {
        renderError(err.message);
        return;
    }
    render();
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function computeStats() {
    const now = new Date();
    const { users, orgs } = STATE;

    const totalUsers     = users.length;
    const pendingSignups = users.filter(u => u.pending_org_id).length;
    const brokenUsers    = users.filter(u =>
        u.confirmed_at && !u.pending_org_id && !u.org_id
    ).length;

    const totalOrgs    = orgs.length;
    const paidOrgs     = orgs.filter(o =>
        (o.paddle_id || o.subscription_id) &&
        (!o.license_expires_at || new Date(o.license_expires_at) > now)
    ).length;
    const trialOrgs    = orgs.filter(o =>
        o.is_trial && (!o.trial_expires_at || new Date(o.trial_expires_at) > now) &&
        !o.paddle_id && !o.subscription_id
    ).length;
    const expiredTrials = orgs.filter(o =>
        o.is_trial &&
        o.trial_expires_at && new Date(o.trial_expires_at) <= now &&
        !o.paddle_id && !o.subscription_id
    ).length;
    const activeLicenses = orgs.reduce((s, o) => s + (o.used_licenses || 0), 0);

    return { totalUsers, pendingSignups, brokenUsers, totalOrgs, paidOrgs, trialOrgs, expiredTrials, activeLicenses };
}

function renderStats() {
    const s   = computeStats();
    const bar = document.getElementById('statsBar');
    const trialLabel = s.expiredTrials > 0
        ? `${s.trialOrgs} trial <span class="stat-warn">(${s.expiredTrials} expired)</span>`
        : `${s.trialOrgs} trial`;
    const brokenPart = s.brokenUsers > 0
        ? `<span class="stat-sep">·</span><span class="stat-broken" id="brokenFilter">${s.brokenUsers} broken ⚠</span>`
        : '';

    bar.innerHTML = `
        <span class="stat-item">${s.totalUsers} users</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.totalOrgs} orgs</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.paidOrgs} paid</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${trialLabel}</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.activeLicenses} active licenses</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">${s.pendingSignups} pending signups</span>
        ${brokenPart}
    `;

    const brokenBtn = document.getElementById('brokenFilter');
    if (brokenBtn) {
        brokenBtn.addEventListener('click', () => {
            STATE.view   = 'users';
            STATE.search = '__broken__';
            document.getElementById('searchInput').value = '';
            updateNav();
            renderView();
        });
    }
}

// ─── Status / badge helpers ───────────────────────────────────────────────────

function getUserStatus(u) {
    if (u.pending_org_id)                       return { label: 'Pending',    cls: 'bdg-red'    };
    if (!u.confirmed_at)                        return { label: 'Unverified', cls: 'bdg-red'    };
    if (!u.org_id)                              return { label: 'No Org',     cls: 'bdg-yellow' };
    if (u.invite_token_hash && !u.accepted_at)  return { label: 'Invited',    cls: 'bdg-blue'   };
    if (u.has_license === false)                return { label: 'No License', cls: 'bdg-orange' };
    return                                             { label: 'Active',     cls: 'bdg-green'  };
}

function getOrgBadge(o) {
    const now    = new Date();
    const isPaid = !!(o.paddle_id || o.subscription_id);

    if (o.grace_period_end && new Date(o.grace_period_end) > now) {
        return { label: 'GRACE PERIOD', cls: 'bdg-orange' };
    }
    if (o.total_licenses == null) {
        return { label: 'NO LICENSE', cls: 'bdg-gray' };
    }
    if (isPaid) {
        if (!o.license_expires_at)                        return { label: 'PAID',    cls: 'bdg-green'  };
        const exp  = new Date(o.license_expires_at);
        if (exp < now)                                    return { label: 'EXPIRED', cls: 'bdg-red'    };
        const days = Math.ceil((exp - now) / 86400000);
        if (days <= 30) return { label: `EXPIRING (${days}d)`, cls: 'bdg-orange' };
        return { label: 'PAID', cls: 'bdg-green' };
    }
    // Trial
    if (!o.trial_expires_at)                              return { label: 'TRIAL',          cls: 'bdg-blue' };
    const tExp = new Date(o.trial_expires_at);
    if (tExp < now)                                       return { label: 'EXPIRED TRIAL',  cls: 'bdg-red'  };
    const days = Math.ceil((tExp - now) / 86400000);
    return { label: `TRIAL (${days}d)`, cls: 'bdg-blue' };
}

// ─── Users view ───────────────────────────────────────────────────────────────

function filterUsers() {
    const q = STATE.search.toLowerCase();
    if (!q)             return STATE.users;
    if (q === '__broken__') return STATE.users.filter(u =>
        u.confirmed_at && !u.pending_org_id && !u.org_id
    );
    return STATE.users.filter(u =>
        (u.email    || '').toLowerCase().includes(q) ||
        (u.name     || '').toLowerCase().includes(q) ||
        (u.org_name || '').toLowerCase().includes(q) ||
        (u.role     || '').toLowerCase().includes(q)
    );
}

function renderUsers() {
    const users     = filterUsers();
    const container = document.getElementById('viewUsers');

    if (!users.length) {
        container.innerHTML = '<p class="adm-empty">No users found.</p>';
        return;
    }

    const rows = users.map(u => {
        const status   = getUserStatus(u);
        const orgCell  = u.org_name
            ? esc(u.org_name)
            : u.pending_org_name
                ? `<span class="cell-muted">${esc(u.pending_org_name)} (pending)</span>`
                : '—';
        const licCell  = u.has_license === true
            ? '<span class="lic-yes">✓</span>'
            : u.has_license === false
                ? '<span class="lic-no">✗</span>'
                : '—';

        return `<tr>
            <td>
                <div class="cell-primary">${esc(u.name || '—')}</div>
                <div class="cell-muted">${esc(u.email || '—')}</div>
            </td>
            <td><span class="bdg ${status.cls}">${status.label}</span></td>
            <td>${orgCell}</td>
            <td>${u.role ? esc(u.role) : '—'}</td>
            <td>${licCell}</td>
            <td title="${esc(u.last_sign_in_at || '')}">${relTime(u.last_sign_in_at)}</td>
            <td title="${esc(u.signed_up_at || '')}">${relTime(u.signed_up_at)}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="adm-table">
            <thead><tr>
                <th>Name / Email</th>
                <th>Status</th>
                <th>Organization</th>
                <th>Role</th>
                <th>License</th>
                <th>Last Sign In</th>
                <th>Signed Up</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="adm-count">${users.length} user${users.length !== 1 ? 's' : ''}</div>
    `;
}

// ─── Orgs view ────────────────────────────────────────────────────────────────

function filterOrgs() {
    const q = STATE.search.toLowerCase();
    if (!q) return STATE.orgs;
    return STATE.orgs.filter(o =>
        (o.name        || '').toLowerCase().includes(q) ||
        (o.owner_email || '').toLowerCase().includes(q) ||
        (o.members || []).some(m =>
            (m.email || '').toLowerCase().includes(q) ||
            (m.name  || '').toLowerCase().includes(q)
        )
    );
}

function renderMemberRows(members) {
    if (!members || !members.length) {
        return '<div class="member-row"><span class="cell-muted">No members</span></div>';
    }
    return members.map((m, i) => {
        const isLast    = i === members.length - 1;
        const isPending = m.invite_token_hash && !m.accepted_at;
        const joinText  = m.accepted_at
            ? `joined ${shortDate(m.accepted_at)}`
            : m.invited_at
                ? `invited ${shortDate(m.invited_at)}`
                : '';
        const nameNote  = m.name ? ` <span class="cell-muted">(${esc(m.name)})</span>` : '';
        const licSpan   = m.has_license
            ? '<span class="lic-yes">✓ licensed</span>'
            : '<span class="lic-no">✗ no license</span>';

        return `<div class="member-row">
            <span class="member-tree">${isLast ? '└─' : '├─'}</span>
            <span class="member-email">${esc(m.email || '—')}${nameNote}</span>
            <span class="member-role ${m.role === 'admin' ? 'role-admin' : 'role-member'}">${esc(m.role)}</span>
            ${licSpan}
            ${joinText ? `<span class="member-join">${joinText}</span>` : ''}
            ${isPending ? '<span class="bdg bdg-blue">INVITE PENDING</span>' : ''}
        </div>`;
    }).join('');
}

function renderOrgs() {
    const orgs      = filterOrgs();
    const container = document.getElementById('viewOrgs');

    if (!orgs.length) {
        container.innerHTML = '<p class="adm-empty">No organizations found.</p>';
        return;
    }

    const items = orgs.map(o => {
        const badge      = getOrgBadge(o);
        const attention  = ['bdg-red', 'bdg-orange', 'bdg-gray'].includes(badge.cls);
        const expanded   = STATE.expandedOrgs.has(o.id);
        const seats      = o.total_licenses != null ? `${o.used_licenses || 0}/${o.total_licenses}` : '—';

        let expiryText = '';
        if (o.license_expires_at && (badge.label === 'PAID' || badge.label.startsWith('EXPIRING'))) {
            expiryText = `expires ${shortDate(o.license_expires_at)}`;
        } else if (o.license_expires_at && badge.label === 'EXPIRED') {
            expiryText = `expired ${shortDate(o.license_expires_at)}`;
        } else if (o.trial_expires_at && badge.label.startsWith('TRIAL')) {
            expiryText = `expires ${shortDate(o.trial_expires_at)}`;
        } else if (o.trial_expires_at && badge.label === 'EXPIRED TRIAL') {
            expiryText = `expired ${shortDate(o.trial_expires_at)}`;
        }

        const scheduledNote = o.scheduled_total_licenses != null
            ? `<span class="org-scheduled">→ ${o.scheduled_total_licenses} seats on ${shortDate(o.scheduled_change_at)}</span>`
            : '';

        const memberHtml = expanded ? renderMemberRows(o.members) : '';

        return `<div class="org-row${expanded ? ' org-expanded' : ''}" data-org-id="${esc(o.id)}">
            <div class="org-header" onclick="toggleOrg('${esc(o.id)}')">
                <span class="org-toggle">${expanded ? '▼' : '▶'}</span>
                <span class="org-name">${esc(o.name)}${attention ? ' <span class="warn-icon">⚠</span>' : ''}</span>
                <span class="bdg ${badge.cls}">${badge.label}</span>
                ${expiryText ? `<span class="org-expiry">${expiryText}</span>` : ''}
                ${scheduledNote}
                <span class="org-meta">
                    <span class="org-seats">${seats} seats</span>
                    <span class="org-mcount">${o.member_count} member${o.member_count !== 1 ? 's' : ''}</span>
                </span>
            </div>
            ${expanded ? `<div class="org-members-list">${memberHtml}</div>` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="org-list">${items}</div>
        <div class="adm-count">${orgs.length} org${orgs.length !== 1 ? 's' : ''}</div>
    `;
}

// Called from inline onclick — must be on window
window.toggleOrg = function(orgId) {
    if (STATE.expandedOrgs.has(orgId)) STATE.expandedOrgs.delete(orgId);
    else                               STATE.expandedOrgs.add(orgId);
    renderOrgs();
};

// ─── Rendering orchestration ──────────────────────────────────────────────────

function render() {
    renderStats();
    renderView();
}

function renderView() {
    const uEl = document.getElementById('viewUsers');
    const oEl = document.getElementById('viewOrgs');
    uEl.style.display = STATE.view === 'users' ? 'block' : 'none';
    oEl.style.display = STATE.view === 'orgs'  ? 'block' : 'none';
    if (STATE.view === 'users') renderUsers();
    else                        renderOrgs();
}

function renderLoading() {
    document.getElementById('viewUsers').innerHTML = '<p class="adm-empty">Loading…</p>';
    document.getElementById('viewOrgs').innerHTML  = '<p class="adm-empty">Loading…</p>';
    document.getElementById('statsBar').textContent = 'Loading stats…';
}

function renderError(msg) {
    const html = `<p class="adm-error">Error: ${esc(msg)}</p>`;
    document.getElementById('viewUsers').innerHTML = html;
    document.getElementById('viewOrgs').innerHTML  = html;
}

// ─── UI wire-up ───────────────────────────────────────────────────────────────

function updateNav() {
    document.querySelectorAll('.adm-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === STATE.view);
    });
}

function init() {
    document.querySelectorAll('.adm-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            STATE.view   = btn.dataset.view;
            STATE.search = '';
            document.getElementById('searchInput').value = '';
            updateNav();
            renderView();
        });
    });

    document.getElementById('searchInput').addEventListener('input', e => {
        STATE.search = e.target.value;
        renderView();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        STATE.expandedOrgs.clear();
        document.getElementById('searchInput').value = '';
        STATE.search = '';
        fetchAll();
    });

    fetchAll();
}

document.addEventListener('DOMContentLoaded', init);
