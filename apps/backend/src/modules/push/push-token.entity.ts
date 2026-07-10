/**
 * A registered device push token: where the escalation ladder can send a critical
 * alert. The token is an opaque FCM/APNs address for a phone, tied to the caregiver
 * (user) who registered it and their family. Never a person's data (rule #1).
 */
export interface PushToken {
  id: string;
  userId: string;
  familyId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: string;
}
