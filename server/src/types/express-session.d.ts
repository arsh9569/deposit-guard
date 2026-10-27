import 'express-session';

declare module 'express-session' {
  interface SessionData {
    signupVerifiedEmail?: string;
    signupVerifiedAt?: number;
  }
}