// Welcome/auth/password-recovery screens — everything rendered before or
// around having a signed-in session.
import { state } from '../../core/state.js';
import { esc } from '../../core/dom.js';
import { icon } from '../../core/ui.js';

export function pwField(id, name, label, placeholder, autocomplete = 'current-password') {
  return `
  <div class="form-group">
    <label for="${id}">${label}</label>
    <div class="pw-wrap">
      <input type="password" id="${id}" name="${name}" placeholder="${placeholder}" required autocomplete="${autocomplete}">
      <button type="button" class="pw-toggle" data-pw-id="${id}" title="Show/hide password">${icon.eye}</button>
    </div>
  </div>`;
}

export function viewWelcome() {
  return `
  <div class="welcome-screen">
    <div class="welcome-hero">
      <svg viewBox="0 0 400 440" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="welcome-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="55%" stop-color="#FDF6EF"/>
            <stop offset="100%" stop-color="#FBE7D6"/>
          </linearGradient>
          <radialGradient id="welcome-glow" cx="50%" cy="38%" r="55%">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.14"/>
            <stop offset="70%" stop-color="var(--accent)" stop-opacity="0.05"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </radialGradient>
          <filter id="welcome-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="var(--dark)" flood-opacity="0.16"/>
          </filter>
          <clipPath id="welcome-curve">
            <path d="M0,0 H400 V352 C 300,414 100,414 0,352 Z"/>
          </clipPath>
        </defs>

        <g clip-path="url(#welcome-curve)">
          <rect width="400" height="440" fill="url(#welcome-sky)"/>
          <rect width="400" height="440" fill="url(#welcome-glow)"/>

          <g transform="translate(88,182) rotate(-12)" filter="url(#welcome-shadow)">
            <rect width="150" height="94" rx="14" fill="var(--dark)"/>
            <circle cx="22" cy="22" r="8" fill="#FFFFFF" opacity="0.9"/>
            <rect x="16" y="65" width="58" height="7" rx="3.5" fill="#FFFFFF" opacity="0.5"/>
            <rect x="16" y="78" width="38" height="6" rx="3" fill="#FFFFFF" opacity="0.32"/>
          </g>

          <g transform="translate(190,152) rotate(9)" filter="url(#welcome-shadow)">
            <rect width="150" height="94" rx="14" fill="var(--accent)"/>
            <circle cx="22" cy="22" r="8" fill="#FFFFFF" opacity="0.95"/>
            <rect x="16" y="65" width="64" height="7" rx="3.5" fill="#FFFFFF" opacity="0.55"/>
            <rect x="16" y="78" width="40" height="6" rx="3" fill="#FFFFFF" opacity="0.35"/>
          </g>

          <g transform="translate(132,208) rotate(-2)" filter="url(#welcome-shadow)">
            <rect width="164" height="102" rx="16" fill="var(--primary)"/>
            <circle cx="24" cy="24" r="9" fill="#FFFFFF" opacity="0.95"/>
            <rect x="18" y="70" width="70" height="8" rx="4" fill="#FFFFFF" opacity="0.65"/>
            <rect x="18" y="84" width="46" height="6" rx="3" fill="#FFFFFF" opacity="0.4"/>
          </g>
        </g>
      </svg>
    </div>

    <div class="welcome-content">
      <h1 class="welcome-title">
        <span class="welcome-title-line">Welcome to</span>
        <span class="welcome-title-brand"><span class="welcome-title-voucher">Voucher</span><span class="welcome-title-wise">Wise</span></span>
      </h1>
      <p class="welcome-desc">Unlock the full value of every voucher you own.</p>

      <div class="welcome-actions">
        <button type="button" class="btn btn-dark btn-full" data-nav="auth" data-tab="signup">Get started</button>
        <div class="welcome-secondary">
          Already have an account?
          <button type="button" class="link-btn" data-nav="auth" data-tab="login">Log in</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function viewAuth() {
  const tab = state.params.tab || 'login';
  return `
  <div class="auth-screen">
    <button type="button" class="btn-icon auth-back" data-nav="welcome">${icon.back}</button>
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1><span style="color:#11233F">Voucher</span><span style="color:#13B5A2">Wise</span></h1>
      <p>Unlock the full value of every voucher you own.</p>
    </div>

    ${localStorage.getItem('pendingGiftId') ? `
    <div class="gift-waiting-banner">${icon.gift} You have a gift waiting! Log in or sign up to claim it.</div>
    ` : ''}

    <div class="auth-tabs">
      <button class="auth-tab ${tab === 'login' ? 'active' : ''}" data-nav="auth" data-tab="login">Log In</button>
      <button class="auth-tab ${tab === 'signup' ? 'active' : ''}" data-nav="auth" data-tab="signup">Sign Up</button>
    </div>

    ${tab === 'login' ? `
    <form id="form-login" class="auth-form">
      <div id="auth-error" class="error-msg" style="display:none"></div>
      <div class="form-group">
        <label for="login-email">Email</label>
        <input type="email" id="login-email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      ${pwField('login-password', 'password', 'Password', '••••••••', 'current-password')}
      <button type="submit" class="btn btn-primary btn-full">Log In</button>
      <div style="text-align:center;margin-top:12px">
        <button type="button" class="link-btn" data-nav="forgot-password" style="font-size:0.875rem;color:var(--text-muted)">Forgot password?</button>
      </div>
    </form>
    ` : `
    <form id="form-signup" class="auth-form">
      <div id="auth-error" class="error-msg" style="display:none"></div>
      <div class="form-group">
        <label for="signup-first-name">First Name</label>
        <input type="text" id="signup-first-name" name="firstName" placeholder="Your first name" required autocomplete="given-name">
      </div>
      <div class="form-group">
        <label for="signup-last-name">Last Name</label>
        <input type="text" id="signup-last-name" name="lastName" placeholder="Your last name" required autocomplete="family-name">
      </div>
      <div class="form-group">
        <label for="signup-email">Email</label>
        <input type="email" id="signup-email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      ${pwField('signup-password', 'password', 'Password', 'Min. 8 characters', 'new-password')}
      <button type="submit" class="btn btn-primary btn-full">Create Account</button>
    </form>
    `}
  </div>`;
}

export function viewResetPassword() {
  return `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1>Set New Password</h1>
      <p>Choose a new password for your account.</p>
    </div>
    <form id="form-reset-password" class="auth-form">
      <div id="reset-error" class="error-msg" style="display:none"></div>
      ${pwField('reset-password', 'password', 'New Password', 'Min. 8 characters', 'new-password')}
      ${pwField('reset-password-confirm', 'passwordConfirm', 'Confirm Password', 'Re-enter password', 'new-password')}
      <button type="submit" class="btn btn-primary btn-full">Update Password</button>
    </form>
  </div>`;
}

export function viewForgotPassword() {
  return `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1>Reset Password</h1>
      <p>Enter your email and we'll send you a reset link.</p>
    </div>
    <form id="form-forgot" class="auth-form">
      <div id="forgot-error" class="error-msg" style="display:none"></div>
      <div id="forgot-success" style="display:none;background:var(--success-light);color:var(--success);border-radius:10px;padding:12px 14px;font-size:0.875rem;text-align:center;margin-bottom:12px"></div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      <button type="submit" class="btn btn-primary btn-full">Send Reset Link</button>
    </form>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" data-nav="auth" data-tab="login">Back to Log In</button>
  </div>`;
}

export function viewVerifyEmail() {
  const email = state.params?.email || '';
  return `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-mark">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="18" fill="#13B5A2"/>
          <rect x="11" y="8" width="50" height="30" rx="9" fill="#2BD4BE" opacity="0.6"/>
          <rect x="6" y="26" width="60" height="38" rx="11" fill="white"/>
          <rect x="38" y="35" width="22" height="14" rx="7" fill="#11233F"/>
        </svg>
      </div>
      <h1>Check your email</h1>
      <p>We sent a confirmation link to<br><strong>${esc(email)}</strong></p>
    </div>
    <div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:0.9rem">
      Click the link in the email to activate your account.<br>This page will update automatically.
    </div>
    <button class="btn btn-primary btn-full" id="btn-resend-email" data-action="resend-email">Resend Email</button>
    <div id="resend-msg" style="text-align:center;margin-top:10px;font-size:0.875rem;min-height:20px"></div>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" data-nav="auth" data-tab="login">Back to Log In</button>
  </div>`;
}
