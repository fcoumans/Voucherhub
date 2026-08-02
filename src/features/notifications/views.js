// Notifications tab — the in-app feed of activity_notifications rows
// (linked from Profile). See features/notifications/activity.js for fetch
// + mark-read; reminders.js/push.js own the separate reminder-scheduling
// and push-permission features.
import { state } from '../../core/state.js';
import { esc, formatDate } from '../../core/dom.js';
import { icon, renderHeader, renderBottomNav, navIcons } from '../../core/ui.js';

const TYPE_ICON = {
  expiry:           icon.clock,
  friend_request:   icon.users,
  referral_used:    icon.link,
  listing_interest: icon.tag,
};

function notificationRow(n) {
  return `
  <button type="button" class="settings-item" style="${n.read ? '' : 'background:var(--primary-light)'}" data-action="open-notification" data-id="${esc(n.id)}" data-link-view="${esc(n.linkView || '')}" data-link-id="${esc(n.linkId || '')}">
    <div class="si-icon" style="background:${n.read ? 'var(--gray-light)' : 'var(--primary-light)'};color:${n.read ? 'var(--text-muted)' : 'var(--primary-dark)'}">${TYPE_ICON[n.type] || icon.info}</div>
    <div class="si-text">
      <div class="si-title">${esc(n.title)}</div>
      <div class="si-subtitle">${esc(n.body)}</div>
      <div class="text-muted" style="font-size:0.6875rem;margin-top:2px">${formatDate(n.createdAt.slice(0, 10))}</div>
    </div>
    ${!n.read ? '<span class="hero-dot" style="position:static;flex-shrink:0"></span>' : ''}
  </button>`;
}

export function viewNotifications() {
  const list = state.activityNotifications;
  const unreadCount = list.filter(n => !n.read).length;

  return `
  ${renderHeader('Notifications', 'profile')}
  <main class="content">
    ${unreadCount > 0 ? `
    <button type="button" class="link-btn" style="margin-bottom:12px" data-action="mark-all-notifications-read">Mark all as read</button>
    ` : ''}
    ${list.length > 0
      ? `<div class="settings-list">${list.map(notificationRow).join('')}</div>`
      : `<div class="empty-state">
           <div class="empty-icon">${icon.bell}</div>
           <h3>No notifications yet</h3>
           <p>Expiry reminders, friend requests, referral uses, and marketplace interest will show up here.</p>
         </div>`
    }
  </main>
  ${renderBottomNav()}`;
}
