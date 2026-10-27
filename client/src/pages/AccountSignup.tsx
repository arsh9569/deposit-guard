
import { useState, type FormEvent } from 'react';
import './account-signup.css';
import {
  sendSignupOtp,
  verifySignupOtp,
  registerAccount,
} from '../lib/api';

type AccountType = 'student' | 'institution';
type Step = 1 | 2 | 3 | 4;

type SignupData = {
  name: string;
  email: string;
  phone: string;
  enrollment: string;
  course: string;
  institutionName: string;
  approvalNumber: string;
  representative: string;
  password: string;
  confirmPassword: string;
};

const initialData: SignupData = {
  name: '',
  email: '',
  phone: '',
  enrollment: '',
  course: '',
  institutionName: '',
  approvalNumber: '',
  representative: '',
  password: '',
  confirmPassword: '',
};

const steps = [
  'Account Details',
  'Email Verification',
  'Password Setup',
  'Review',
];

export function AccountSignup({
  onBack,
}: {
  onBack: () => void;
}) {
  const [type, setType] = useState<AccountType>('student');
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<SignupData>(initialData);
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [error, setError] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState('');
  const handleRegister = async () => {
  if (!otpVerified || registerLoading || registrationSuccess) return;

  setRegisterLoading(true);
  setError('');

  try {
    const message = await registerAccount({
      type,
      name: data.name,
      email: data.email.trim(),
      phone: data.phone,
      password: data.password,
      enrollment: data.enrollment,
      course: data.course,
      institutionName: data.institutionName,
      approvalNumber: data.approvalNumber,
      representative: data.representative,
    });

    setRegistrationSuccess(message);
  } catch (err) {
    setError(
      err instanceof Error ? err.message : 'Registration failed.',
    );
  } finally {
    setRegisterLoading(false);
  }
};
  const handleSendOtp = async () => {
  if (otpLoading) return;

  setOtpLoading(true);
  setError('');
  setOtpMessage('');

  try {
    await sendSignupOtp(data.email.trim());
    setOtpSent(true);
    setOtp('');
    setOtpVerified(false);
    setOtpMessage('OTP sent! Check your email. Code expires in 5 minutes.');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Could not send OTP.');
  } finally {
    setOtpLoading(false);
  }
};

const handleVerifyOtp = async () => {
  if (otpLoading || !otpSent || otp.length !== 6) return;

  setOtpLoading(true);
  setError('');

  try {
    await verifySignupOtp(data.email.trim(), otp);
    setOtpVerified(true);
    setOtpMessage('Email verified successfully.');
    setStep(3);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Invalid OTP.');
  } finally {
    setOtpLoading(false);
  }
};

  const update = (field: keyof SignupData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const strength = [
    data.password.length >= 12,
    /[A-Z]/.test(data.password),
    /[0-9]/.test(data.password),
    /[^A-Za-z0-9]/.test(data.password),
  ].filter(Boolean).length;

  const nextFromDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setStep(2);
  };

  const nextFromPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (strength < 4) {
      setError(
        'Use at least 8 characters, an uppercase letter, a number and a symbol.',
      );
      return;
    }

    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setStep(4);
  };

  const changeType = (nextType: AccountType) => {
    setType(nextType);
    setError('');
  };

  return (
    <main className="dg-signup">
      <aside className="dg-signup-hero">
        <div className="dg-brand">
          <div className="dg-brand-icon">✺</div>
          <div>
            <strong>AICTE</strong>
            <span>Security Deposit & FDR Portal</span>
          </div>
        </div>

        <div className="dg-hero-content">
          <div className="dg-eyebrow">
            DEPOSIT GUARD PLATFORM
          </div>

          <h1>
            Secure Deposits.
            <br />
            <span>Smarter Compliance.</span>
          </h1>

          <p>
            A unified digital platform for secure FDR records,
            maturity monitoring and transparent institutional workflows.
          </p>

          <div className="dg-feature">
            <span>◇</span>
            <div>
              <strong>Digital FDR Management</strong>
              <small>
                Organized deposit records and lifecycle tracking
              </small>
            </div>
          </div>

          <div className="dg-feature">
            <span>◷</span>
            <div>
              <strong>Smart Maturity Monitoring</strong>
              <small>
                Track upcoming maturity dates and actions
              </small>
            </div>
          </div>

          <div className="dg-feature">
            <span>✓</span>
            <div>
              <strong>Secure Role-Based Access</strong>
              <small>
                Dedicated experiences for students and institutions
              </small>
            </div>
          </div>
        </div>

        <div className="dg-hero-footer">
          SIH PROJECT DEMONSTRATION
          <span>
            SECURE · TRANSPARENT · ACCOUNTABLE
          </span>
        </div>
      </aside>

      <section className="dg-signup-panel">
        <div className="dg-signup-card">
          <div className="dg-signup-top">
            <span>ACCOUNT REGISTRATION</span>
            <button type="button" onClick={onBack}>
              ← Back to Login
            </button>
          </div>

          <div
            className="dg-progress"
            aria-label={`Registration step ${step} of 4`}
          >
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className={item <= step ? 'active' : ''}
              />
            ))}
          </div>

          <div className="dg-step-label">
            STEP {step} OF 4 · {steps[step - 1]}
          </div>

          <h2>
            {step === 1
              ? 'Create your account'
              : step === 2
                ? 'Verify your email'
                : step === 3
                  ? 'Secure your account'
                  : 'Review your details'}
          </h2>

          <p className="dg-subtitle">
            {step === 1
              ? 'Select your account type and enter your information.'
              : step === 2
                ? 'Confirm ownership of your email address.'
                : step === 3
                  ? 'Create a strong password to protect your account.'
                  : 'Review your information before submitting.'}
          </p>

          {step === 1 && (
            <form onSubmit={nextFromDetails}>
              <div className="dg-role-grid">
                <button
                  type="button"
                  className={`dg-role ${
                    type === 'student' ? 'selected' : ''
                  }`}
                  aria-pressed={type === 'student'}
                  onClick={() => changeType('student')}
                >
                  <span className="dg-role-icon">🎓</span>
                  <strong>Student</strong>
                  <small>Track deposits & refunds</small>
                </button>

                <button
                  type="button"
                  className={`dg-role ${
                    type === 'institution' ? 'selected' : ''
                  }`}
                  aria-pressed={type === 'institution'}
                  onClick={() => changeType('institution')}
                >
                  <span className="dg-role-icon">▦</span>
                  <strong>Institution</strong>
                  <small>Manage FDR compliance</small>
                </button>
              </div>

              <div className="dg-form-grid">
                <label className="dg-field dg-full">
                  <span>
                    {type === 'student'
                      ? 'Full Name'
                      : 'Institution Name'}
                  </span>
                  <input
                    required
                    value={data.name}
                    onChange={(event) =>
                      update('name', event.target.value)
                    }
                    placeholder={
                      type === 'student'
                        ? 'Enter your full name'
                        : 'Enter institution name'
                    }
                  />
                </label>

                <label className="dg-field dg-full">
                  <span>Email Address</span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={data.email}
                    onChange={(event) =>
                      update('email', event.target.value)
                    }
                    placeholder="Enter email address"
                  />
                </label>

                <label className="dg-field dg-full">
                  <span>Contact Number</span>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={data.phone}
                    onChange={(event) =>
                      update('phone', event.target.value)
                    }
                    placeholder="10-digit mobile number"
                  />
                </label>

                {type === 'student' ? (
                  <>
                    <label className="dg-field">
                      <span>Enrollment Number</span>
                      <input
                        required
                        value={data.enrollment}
                        onChange={(event) =>
                          update('enrollment', event.target.value)
                        }
                        placeholder="Enrollment ID"
                      />
                    </label>

                    <label className="dg-field">
                      <span>Course / Program</span>
                      <input
                        required
                        value={data.course}
                        onChange={(event) =>
                          update('course', event.target.value)
                        }
                        placeholder="e.g. B.Tech CSE"
                      />
                    </label>

                    <label className="dg-field dg-full">
                      <span>Institution Name</span>
                      <input
                        required
                        value={data.institutionName}
                        onChange={(event) =>
                          update('institutionName', event.target.value)
                        }
                        placeholder="Enter your institution"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="dg-field dg-full">
                      <span>AICTE Approval Number</span>
                      <input
                        required
                        value={data.approvalNumber}
                        onChange={(event) =>
                          update('approvalNumber', event.target.value)
                        }
                        placeholder="Enter approval number"
                      />
                    </label>

                    <label className="dg-field dg-full">
                      <span>Authorized Representative</span>
                      <input
                        required
                        value={data.representative}
                        onChange={(event) =>
                          update('representative', event.target.value)
                        }
                        placeholder="Representative's name"
                      />
                    </label>
                  </>
                )}
              </div>

              <button className="dg-primary" type="submit">
                Continue to Email Verification →
              </button>
            </form>
          )}

          {step === 2 && (
  <div className="dg-otp-section">
    <div className="dg-otp-icon" aria-hidden="true">
      ✉
    </div>

    <h3>Email Verification</h3>

    <p>
      Send a 6-digit verification code to
      <strong> {data.email}</strong>
    </p>

    {!otpSent && (
      <button
        type="button"
        className="dg-primary"
        disabled={otpLoading}
        onClick={handleSendOtp}
      >
        {otpLoading ? 'Sending OTP...' : 'Send OTP'}
      </button>
    )}

    {otpSent && (
      <>
        <label htmlFor="signup-otp">Verification Code</label>

        <input
          id="signup-otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(event) =>
            setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
          }
          placeholder="Enter 6-digit OTP"
        />

        <p className="dg-hint">
          Enter the code sent to your email. Valid for 5 minutes.
        </p>

        <button
          type="button"
          className="dg-primary"
          disabled={otpLoading || otp.length !== 6}
          onClick={handleVerifyOtp}
        >
          {otpLoading ? 'Verifying...' : 'Verify Email'}
        </button>

        <button
          type="button"
          className="dg-secondary"
          disabled={otpLoading}
          onClick={handleSendOtp}
        >
          Resend OTP
        </button>
      </>
    )}

    {otpMessage && (
      <p className="dg-hint" role="status">
        {otpMessage}
      </p>
    )}

    {error && (
      <p className="dg-error" role="alert">
        {error}
      </p>
    )}

    <button
      type="button"
      className="dg-secondary"
      disabled={otpLoading}
      onClick={() => {
        setOtp('');
        setOtpSent(false);
        setOtpVerified(false);
        setOtpMessage('');
        setError('');
        setStep(1);
      }}
    >
      ← Change Email
    </button>
  </div>
)}
          {step === 3 && otpVerified && (
            <form onSubmit={nextFromPassword}>
              <div className="dg-form-grid">
                <label className="dg-field dg-full">
                  <span>Create Password</span>
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={data.password}
                    onChange={(event) =>
                      update('password', event.target.value)
                    }
                    placeholder="Create a strong password"
                  />
                </label>

                <div className="dg-full">
                  <div className="dg-strength">
                    {[1, 2, 3, 4].map((item) => (
                      <div
                        key={item}
                        className={
                          data.password && item <= strength
                            ? 'filled'
                            : ''
                        }
                      />
                    ))}
                  </div>

                  <small className="dg-hint">
                    Minimum 12 characters, uppercase, number and symbol.
                  </small>
                </div>

                <label className="dg-field dg-full">
                  <span>Confirm Password</span>
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={data.confirmPassword}
                    onChange={(event) =>
                      update('confirmPassword', event.target.value)
                    }
                    placeholder="Confirm your password"
                  />
                </label>
              </div>

              {error && (
                <p className="dg-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dg-actions">
                <button
                  type="button"
                  className="dg-secondary"
                  onClick={() => setStep(2)}
                >
                  Back
                </button>

                <button className="dg-primary" type="submit">
                  Review Details →
                </button>
              </div>
            </form>
          )}

          {step === 4 && (
            <div className="dg-review">
              <div>
                <span>Account Type</span>
                <strong>
                  {type === 'student'
                    ? 'Student'
                    : 'Institution'}
                </strong>
              </div>

              <div>
                <span>
                  {type === 'student'
                    ? 'Full Name'
                    : 'Institution Name'}
                </span>
                <strong>{data.name}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>{data.email}</strong>
              </div>

              <div>
                <span>Contact Number</span>
                <strong>{data.phone}</strong>
              </div>

              <div>
                <span>
                  {type === 'student'
                    ? 'Enrollment Number'
                    : 'AICTE Approval Number'}
                </span>
                <strong>
                  {type === 'student'
                    ? data.enrollment
                    : data.approvalNumber}
                </strong>
              </div>

              <div className="dg-actions">
                <button
                  type="button"
                  className="dg-secondary"
                  onClick={() => setStep(3)}
                >
                  Back
                </button>

          <button
  type="button"
  className="dg-primary"
  onClick={handleRegister}
  disabled={registerLoading || Boolean(registrationSuccess) || !otpVerified}
>
  {registerLoading ? 'Creating Account...' : 'Submit Registration'}
</button>
{registrationSuccess && (
  <div role="status" className="dg-success">
    {registrationSuccess}
  </div>
)}

{error && (
  <div role="alert" className="dg-error">
    {error}
  </div>
)}
              </div>
            </div>
          )}

          <p className="dg-login-footer">
            Already have an account?{' '}
            <button type="button" onClick={onBack}>
              Sign In
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
