// Single shared, mutated-in-place app state. Kept as one object for this
// module-split pass rather than decomposed per feature — that's a state
// management change, not a file-organization one, and a separate effort.
export const CATEGORIES = ['Food & Drink', 'Shopping', 'Travel', 'Entertainment', 'Finance', 'Sports and Health', 'Beauty & Wellness', 'Sustainability', 'Mobility', 'Other'];

export const state = {
  view: 'auth',
  params: {},
  navStack: [], // { view, params } entries — real "where did I come from" history for the back button
  currentUser: null,
  vouchers:   [],
  brands:     [],
  listings:   [],   // marketplace_listings rows
  referrals:  [],   // referral_codes rows
  discoveryBrands: [], // discovery_brands rows — curated catalog for the Discover pillar
  friends:         [],   // user objects { id, name, email }
  friendIds:       [],   // UUID array for quick lookup — direct (1st-degree) friends only
  trustedNetworkIds: [], // UUID array — friends + friends of friends, for Trusted Community
  pendingRequests: [],   // incoming friend requests { id, requesterId, name, email }
  reminders:  [],   // notifications rows
  voucherFiles: [],  // voucher_files rows for the voucher currently open (form or detail)
  pendingGifts: [],  // voucher_gifts rows this user has sent that are still unclaimed
  sentGifts:  [],    // voucher_gifts rows this user has sent, pending or claimed — for the Wallet "Gifted" tab
  searchQuery: '',
  activeFilter: 'active',
  activeSort: 'expiry',
  walletCategoryFilter: 'All',
  marketplaceTab: 'browse',
  marketplaceCategoryFilter: 'All',
  referralTab: 'public',
  referralBrandFilter: null,      // null = brand grid, 'BrandName' = code list for that brand
  referralCategoryFilter: 'All',  // category filter within the referral brand grid
  referralVotes: {},              // { [referralId]: 'up' | 'down' } — in-memory, no DB column yet
  myReferralUses: new Set(),      // referral_code ids the current user has marked "+1 used"
  discoveryCategoryFilter: 'All',
  discoveryRegionFilter: 'All',
  interestedListingIds: new Set(), // marketplace_listings ids the current user has already tapped "I'm interested" on this session — in-memory, no DB column
  activityNotifications: [], // activity_notifications rows — powers the Notifications tab
};
