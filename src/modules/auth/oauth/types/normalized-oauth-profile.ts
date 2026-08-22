export type OAuthProviderName = 'google' | 'github' | 'microsoft';

export interface NormalizedOAuthProfile {
  provider: OAuthProviderName;
  providerAccountId: string;
  email: string;
}
