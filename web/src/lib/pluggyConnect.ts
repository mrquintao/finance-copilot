// The widget runs in Pluggy's iframe: bank credentials never reach this app, and the
// connect token is short-lived and minted by our backend.

/** Opens Pluggy Connect. Resolves with the new item id, or null if closed without success. */
export async function openPluggyConnect(connectToken: string): Promise<string | null> {
  const { PluggyConnect } = await import('pluggy-connect-sdk')
  return new Promise((resolve, reject) => {
    const widget = new PluggyConnect({
      connectToken,
      includeSandbox: import.meta.env.DEV,
      language: 'pt',
      onSuccess: ({ item }: { item: { id?: string } }) => resolve(item.id ?? null),
      onClose: () => resolve(null),
    })
    widget.init().catch(reject)
  })
}
