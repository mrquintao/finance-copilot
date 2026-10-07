// The widget runs in Pluggy's iframe: credentials never reach this app, and the connect
// token is short-lived and minted by our backend.

// MeuPluggy is Pluggy's free personal aggregator. The user links their banks there, and this
// app reads them through a single Pluggy item. It is the only connector the app uses, so the
// widget lists nothing else and opens straight on its login.
const MEU_PLUGGY_CONNECTOR_ID = 200

/**
 * Opens Pluggy Connect on MeuPluggy.
 *
 * Resolves with the item id when Pluggy reports the item as connected, or with null when
 * the user closes the widget without connecting. Rejects when the widget cannot load or
 * is closed after Pluggy reported an error.
 */
export async function openPluggyConnect(connectToken: string): Promise<string | null> {
  const { PluggyConnect } = await import('pluggy-connect-sdk')
  return new Promise((resolve, reject) => {
    // The widget lets the user retry after an error, so an error only counts if the widget
    // is then closed without a success.
    let failed = false
    const widget = new PluggyConnect({
      connectToken,
      connectorIds: [MEU_PLUGGY_CONNECTOR_ID],
      selectedConnectorId: MEU_PLUGGY_CONNECTOR_ID,
      language: 'pt',
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      onSuccess: ({ item }: { item: { id?: string } }) => resolve(item.id ?? null),
      onError: () => {
        failed = true
      },
      onClose: () => (failed ? reject(new Error('Pluggy Connect failed')) : resolve(null)),
    })
    widget.init().catch(reject)
  })
}
