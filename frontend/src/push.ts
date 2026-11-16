/**
 * Web push helpers built on the registered service worker (see
 * public/sw.js, registered in main.tsx). The service worker displays the
 * push payload as a system notification and focuses/opens the app on click.
 */

/** Whether this browser supports service workers, the Push API and notifications. */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Converts the URL-safe base64 VAPID public key to an applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** The relevant part of PushSubscription.toJSON(). */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Subscribes this browser to push notifications: waits for the service worker,
 * asks for notification permission and subscribes with the VAPID public key.
 * @throws An error with message 'permission-denied' when permission is not granted.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionJSON> {
  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('permission-denied');
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('invalid-subscription');
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/**
 * Unsubscribes this browser from push notifications.
 * @returns The endpoint that was unsubscribed, or null when there was none.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
