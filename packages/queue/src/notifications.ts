import webpush from 'web-push';
import twilio from 'twilio';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: twilio.Twilio | null = null;
if (twilioAccountSid && twilioAuthToken) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
}

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export type PushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushResult =
  | { status: 'sent' }
  | { status: 'failed'; error: string }
  | { status: 'logged_only' };

export async function sendPush(
  subscription: PushSubscription,
  payload: { title: string; body: string }
): Promise<PushResult> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return { status: 'logged_only' };
  }

  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify(payload)
    );
    return { status: 'sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: message };
  }
}

export type SmsResult =
  | { status: 'sent'; sid: string }
  | { status: 'failed'; error: string }
  | { status: 'logged_only' };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!twilioClient || !twilioPhoneNumber) {
    return { status: 'logged_only' };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: twilioPhoneNumber,
      to,
    });
    return { status: 'sent', sid: message.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: message };
  }
}

export function isTwilioConfigured(): boolean {
  return Boolean(twilioClient && twilioPhoneNumber);
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);
}
