import { useEffect, useState } from 'react';
import { notificationsAPI, systemAPI } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function ensureRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  return navigator.serviceWorker.register('/sw.js');
}

function extractSubscriptionPayload(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || '',
    auth_key: json.keys?.auth || '',
    device_name: navigator.userAgent,
  };
}

export function usePush() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;

    setIsSupported(supported);

    if (!supported) {
      return;
    }

    setPermission(Notification.permission);
    checkSubscription();
  }, []);

  async function checkSubscription() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(Boolean(subscription));
      return Boolean(subscription);
    } catch {
      setIsSubscribed(false);
      return false;
    }
  }

  async function subscribe() {
    if (!isSupported) {
      return false;
    }

    setLoading(true);

    try {
      const registration = await ensureRegistration();
      const permissionState = await Notification.requestPermission();
      setPermission(permissionState);

      if (permissionState !== 'granted') {
        return false;
      }

      const vapid = await systemAPI.vapidPublicKey().catch(() => null);
      const key = vapid?.public_key;
      if (!key) {
        throw new Error('Не удалось получить публичный ключ VAPID.');
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      await notificationsAPI.subscribePush(extractSubscriptionPayload(subscription));
      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);

    try {
      const subscriptions = await notificationsAPI.listSubscriptions().catch(() => []);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        const remote = subscriptions.find((item) => item.endpoint === endpoint);
        if (remote?.id) {
          await notificationsAPI.removeSubscription(remote.id).catch(() => null);
        }

        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    isSupported,
    isSubscribed,
    permission,
    loading,
    checkSubscription,
    subscribe,
    unsubscribe,
  };
}

export default usePush;
