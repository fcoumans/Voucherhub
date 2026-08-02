// Friends: lookup, fetch (direct + trusted-network ids), and requests
// (send/accept/decline/remove).
//
// `go`/`render` (router) still live in app.js at this point in the module
// split — imported from there for now, repointed once core/router.js exists.
import { supabase } from '../../lib/supabase.js';
import { state } from '../../core/state.js';
import { fullName } from '../../core/dom.js';
import { showToast } from '../../core/toast.js';
import { go, render } from '../../core/router.js';

/* ============================================================
   FETCH
   ============================================================ */
export async function fetchFriendIds() {
  if (!state.currentUser) return;
  const uid = state.currentUser.id;
  const [sent, received, network] = await Promise.all([
    supabase.from('friendships').select('receiver_id').eq('requester_id', uid).eq('status', 'accepted'),
    supabase.from('friendships').select('requester_id').eq('receiver_id', uid).eq('status', 'accepted'),
    supabase.rpc('trusted_network_ids', { p_user: uid }),
  ]);
  if (sent.error)     console.error('fetchFriendIds (sent) error:', sent.error);
  if (received.error) console.error('fetchFriendIds (received) error:', received.error);
  if (network.error)  console.error('fetchFriendIds (network) error:', network.error);
  const sentIds     = (sent.data     || []).map(r => r.receiver_id);
  const receivedIds = (received.data || []).map(r => r.requester_id);
  state.friendIds = [...new Set([...sentIds, ...receivedIds])];
  state.trustedNetworkIds = (network.data || []).map(r => r.user_id);
}

export async function fetchFriends() {
  await fetchFriendIds();
  if (state.friendIds.length === 0) { state.friends = []; return; }
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, email, first_name, last_name')
    .in('id', state.friendIds);
  if (error) {
    console.error('fetchFriends profiles error:', error);
    state.friends = state.friendIds.map(id => ({ id, name: 'Friend', email: 'N/A' }));
    return;
  }
  state.friends = (data || []).map(p => ({ id: p.id, name: fullName(p) || p.email, email: p.email || 'N/A' }));
}

export async function fetchPendingRequests() {
  if (!state.currentUser) return;
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id')
    .eq('receiver_id', state.currentUser.id)
    .eq('status', 'pending');
  if (error) { console.error('fetchPendingRequests error:', error); return; }
  const requests = data || [];
  if (requests.length === 0) { state.pendingRequests = []; return; }
  const requesterIds = requests.map(r => r.requester_id);
  const { data: profiles, error: pErr } = await supabase
    .from('public_profiles')
    .select('id, email, first_name, last_name')
    .in('id', requesterIds);
  if (pErr) console.error('fetchPendingRequests profiles error:', pErr);
  state.pendingRequests = requests.map(r => {
    const p = (profiles || []).find(pr => pr.id === r.requester_id);
    return { id: r.id, requesterId: r.requester_id, name: fullName(p) || p?.email || 'Unknown', email: p?.email || '' };
  });
}

/* ============================================================
   FRIEND ACTIONS
   ============================================================ */
async function fetchUserByEmail(email) {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, email, first_name, last_name, vouchers_sold')
    .eq('email', email)
    .single();
  if (error) return null;
  return data;
}

export async function addFriend(email) {
  const found = await fetchUserByEmail(email.trim().toLowerCase());
  if (!found) return 'No user found with that email.';
  if (found.id === state.currentUser.id) return "That's your own email.";
  if (state.friendIds.includes(found.id)) return 'Already friends with this person.';
  const { data, error } = await supabase.from('friendships').insert({
    requester_id: state.currentUser.id,
    receiver_id:  found.id,
    status:       'pending',
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return 'Friend request already sent.';
    console.error('addFriend error:', error);
    return 'Error sending request.';
  }
  const { error: notifyError } = await supabase.rpc('notify_friend_request', { p_friendship_id: data.id });
  if (notifyError) console.error('notify_friend_request error:', notifyError);
  const displayName = fullName(found) || found.email;
  showToast(`Friend request sent to ${displayName}`);
  return null;
}

export async function acceptFriendRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('receiver_id', state.currentUser.id);
  if (error) { console.error('acceptFriendRequest error:', error); showToast('Error accepting request'); return; }
  showToast('Friend request accepted!');
  await Promise.all([fetchFriends(), fetchPendingRequests()]);
  render();
}

export async function declineFriendRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('receiver_id', state.currentUser.id);
  if (error) { console.error('declineFriendRequest error:', error); showToast('Error declining request'); return; }
  showToast('Request declined');
  await fetchPendingRequests();
  render();
}

export async function removeFriend(friendId) {
  const uid = state.currentUser.id;
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${uid},receiver_id.eq.${friendId}),and(requester_id.eq.${friendId},receiver_id.eq.${uid})`);
  if (error) { console.error('removeFriend error:', error); showToast('Error removing friend'); return; }
  showToast('Friend removed');
  go('friends');
}
