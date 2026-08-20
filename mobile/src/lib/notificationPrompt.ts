export type NotificationPromptInput = {
  physicalDevice: boolean;
  platform: string;
  permission: string;
  dismissed: boolean;
};

export function shouldExplainNotifications(input: NotificationPromptInput): boolean {
  return (
    input.physicalDevice &&
    input.platform !== 'web' &&
    input.permission === 'undetermined' &&
    !input.dismissed
  );
}
