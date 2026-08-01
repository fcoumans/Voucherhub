// Single shared, mutated-in-place app state. Kept as one object for this
// module-split pass rather than decomposed per feature — that's a state
// management change, not a file-organization one, and a separate effort.
export const CATEGORIES = ['Food & Drink', 'Shopping', 'Travel', 'Entertainment', 'Finance', 'Sports and Health', 'Beauty & Wellness', 'Sustainability', 'Mobility', 'Other'];

export const state = {
  view: 'auth',
  params: {},
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
  searchQuery: '',
  activeFilter: 'active',
  activeSort: 'expiry',
  marketplaceTab: 'browse',
  referralTab: 'public',
  referralBrandFilter: null,      // null = brand grid, 'BrandName' = code list for that brand
  referralCategoryFilter: 'All',  // category chip filter within the referral brand grid
  referralVotes: {},              // { [referralId]: 'up' | 'down' } — in-memory, no DB column yet
  myReferralUses: new Set(),      // referral_code ids the current user has marked "+1 used"
  discoveryCategoryFilter: 'All',
  discoveryRegionFilter: 'All',
};
