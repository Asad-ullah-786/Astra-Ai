const SUCCESS_EVENT = "astra:success";

export function notifySuccess(message: string): void {
  window.dispatchEvent(new CustomEvent(SUCCESS_EVENT, { detail: { message } }));
}

export function onSuccessNotification(listener: (message: string) => void): () => void {
  const handleSuccess = (event: Event) => {
    if (!(event instanceof CustomEvent) || typeof event.detail?.message !== "string") {
      return;
    }
    listener(event.detail.message);
  };

  window.addEventListener(SUCCESS_EVENT, handleSuccess);
  return () => window.removeEventListener(SUCCESS_EVENT, handleSuccess);
}
